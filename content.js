console.log("[Grading Scanner] content script active");

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* -----------------------------
        LOAD ALL RESULTS
------------------------------ */

async function loadAllResults() {
    let clicks = 0;
    while (true) {
        const btn = document.querySelector("#loadMoreButton");
        if (!btn || btn.offsetParent === null || btn.disabled) break;
        btn.click();
        clicks++;
        await wait(100);
    }
    await wait(100);
    return clicks;
}

/* -----------------------------
       GRADING SCAN HANDLER
------------------------------ */

let currentListings = [];
let currentHistory = null;

function isProductUrl() {
    const path = window.location.pathname;
    return path.includes("/Products/") &&
        !path.includes("/Products/Search") &&
        !!document.querySelector(".page-title-container h1");
}

function hasArticleRows() {
    return !!document.querySelector(".article-row");
}

// Product-only features (stars, photo filter, overview, jump) use this;
// the graded scanner runs on any page with article rows.
function isProductPage() {
    return isProductUrl() && hasArticleRows();
}

function rowCardName(row) {
    if (isProductUrl()) {
        return document.querySelector(".page-title-container h1")?.textContent?.trim() || "Unknown";
    }
    // Lists of offers (search, seller pages): the row links to its product
    return row.querySelector('a[href*="/Products/"]')?.textContent?.trim() || "Unknown";
}

function rowHasPhoto(row) {
    return !!row.querySelector(".fonticon-camera");
}

function readListing(row) {
    if (!row || !row.id) return null;

    const cardName = rowCardName(row);
    const seller = row.querySelector(".seller-name a")?.textContent?.trim() || "";
    const conditionCode =
        row.querySelector(".article-condition .badge")?.textContent?.trim() || "";

    let language = "";
    let languageId = null;
    const attrs = row.querySelector(".product-attributes");
    if (attrs) {
        const icon =
            attrs.querySelector("span.icon[data-bs-original-title], span.icon[aria-label]") ||
            Array.from(attrs.querySelectorAll("[data-bs-original-title], [aria-label]"))
                .find(el => !el.closest(".article-condition"));
        language = icon?.getAttribute("data-bs-original-title") ||
            icon?.getAttribute("aria-label") || "";
        languageId = languageIdFromBackgroundPosition(icon?.style?.backgroundPosition || "");
    }

    const priceText =
        row.querySelector(".price-container .text-end")?.textContent?.trim() || "";
    const hasPhoto = rowHasPhoto(row);

    const commentText =
        row.querySelector(".product-comments > div > span")?.textContent?.toLowerCase();
    const grade = commentText ? detectGrade(commentText) : null;

    const url = new URL(window.location.href);
    url.hash = row.id;

    return {
        id: row.id,
        url: url.toString(),
        cardName,
        seller,
        conditionCode,
        language,
        languageCode: languageCode(languageId, language),
        priceText,
        price: parsePrice(priceText),
        hasPhoto,
        grade,
        row
    };
}

function scanListings() {
    currentListings = Array.from(document.querySelectorAll(".article-row"))
        .map(readListing)
        .filter(Boolean);
    return currentListings;
}

function localDate() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Records today's graded sightings (all graders) for this product page.
async function recordHistory(listings) {
    if (!isProductPage()) return null;
    const key = productKeyFromUrl(window.location.href);
    if (!key) return null;
    const storageKey = "hist:" + key;
    const stored = await chrome.storage.local.get(storageKey);
    const record = mergeScan(stored[storageKey] || null, {
        today: localDate(),
        name: document.title.replace(/\s*\|\s*Cardmarket\s*$/, "").trim(),
        languages: languageFilterFromSearch(window.location.search),
        otherFilters: hasOtherFilters(window.location.search),
        listings: listings.filter(l => l.grade).map(l => ({
            id: l.id,
            price: l.price,
            language: l.languageCode,
            grade: l.grade
        }))
    });
    await chrome.storage.local.set({ [storageKey]: record });
    return record;
}

function gradedHits(listings, enabledCompanies = null) {
    return listings
        .filter(l => l.grade && (!enabledCompanies || enabledCompanies.includes(l.grade.grader)))
        .map(l => {
            const { savedAt, ...hit } = makeFavorite(l);
            return hit;
        });
}

/* -----------------------------
      PAGE INJECTION / BADGES
------------------------------ */

function styleGradeBadge(el, color) {
    el.style.cssText = `
        display: inline-block;
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 3px;
        background: ${color};
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        font-family: monospace;
        vertical-align: middle;
        letter-spacing: 0.3px;
    `;
}

function injectPageHighlights(hits) {
    // Clean up previous run
    document.querySelectorAll(".gs-grade-badge").forEach(el => el.remove());
    document.querySelectorAll(".article-row").forEach(row => {
        row.style.borderLeft = "";
        row.style.paddingLeft = "";
        delete row.dataset.gsGrader;
    });

    hits.forEach(hit => {
        const row = document.getElementById(hit.id);
        if (!row) return;

        // Tag row with grader so the filter can show/hide it
        row.dataset.gsGrader = hit.condition.grader;

        // Colored left border
        row.style.borderLeft = `3px solid ${hit.condition.color}`;
        row.style.paddingLeft = "4px";

        // Grade badge at the end of the attributes (always visible)
        const attrs = row.querySelector(".product-attributes");
        if (attrs && !attrs.querySelector(".gs-grade-badge")) {
            const badge = document.createElement("span");
            badge.className = "gs-grade-badge";
            badge.textContent = hit.condition.gradeText;
            styleGradeBadge(badge, hit.condition.color);
            attrs.appendChild(badge);
        }
    });
}

/* -----------------------------
    FILTER FORM INJECTION
------------------------------ */

const filterState = { graders: new Set(), photoOnly: false };

// Sidebar rule: a section with a filter set starts open, the rest closed
function setSectionOpen(link, collapse, open) {
    collapse.classList.toggle("show", open);
    link.classList.toggle("collapsed", !open);
    link.setAttribute("aria-expanded", String(open));
}

// Only rows this extension hid (marked with data-gs-hidden) are ever shown
// again; rows hidden by the site itself are left alone.
function applyVisibility() {
    document.querySelectorAll(".article-row").forEach(row => {
        // Displayed grade only (dataset is set solely for enabled graders)
        const grader = row.dataset.gsGrader;
        const graderOk = filterState.graders.size === 0 ||
            (!!grader && filterState.graders.has(grader));
        const photoOk = !filterState.photoOnly || rowHasPhoto(row);
        if (graderOk && photoOk) {
            if (row.dataset.gsHidden === "1") {
                row.style.display = "";
                delete row.dataset.gsHidden;
            }
        } else if (row.dataset.gsHidden !== "1" && row.style.display !== "none") {
            row.style.display = "none";
            row.dataset.gsHidden = "1";
        }
    });
}

function injectFilterForm(hits) {
    // Remove stale injection on re-scan
    const existing = document.getElementById("gs-filter-accordion-item");
    if (existing) existing.remove();

    // Fresh checkboxes are unchecked, so the grader selection starts empty
    filterState.graders.clear();

    const articleFilters = document.getElementById("articleFilters");
    if (!articleFilters) return;

    // Count hits per grader
    const graderCounts = {};
    hits.forEach(hit => {
        const g = hit.condition.grader;
        graderCounts[g] = (graderCounts[g] || 0) + 1;
    });

    // Only include graders that actually appear in results
    const presentGraders = GRADING_PATTERNS.filter(p => graderCounts[p.name]);
    if (presentGraders.length === 0) return;

    const accordionId = "articleFilterGradedCards";

    // Build accordion item matching Cardmarket's Bootstrap accordion structure
    const accordionItem = document.createElement("div");
    accordionItem.id = "gs-filter-accordion-item";
    accordionItem.className = "accordion-item";

    // Header
    const header = document.createElement("div");
    header.className = "accordion-header";

    const headerLink = document.createElement("a");
    headerLink.href = `#${accordionId}`;
    headerLink.setAttribute("data-bs-parent", "#articleFilters");
    headerLink.setAttribute("data-bs-toggle", "collapse");
    headerLink.setAttribute("aria-controls", accordionId);
    headerLink.setAttribute("aria-expanded", "true");

    const h3 = document.createElement("h3");
    h3.className = "h-100 text-nowrap";
    h3.innerHTML = `
<span data-bs-toggle="tooltip" data-bs-html="true" data-bs-placement="right" class="fonticon-star-empty" aria-label="Graded Cards" data-bs-original-title="Graded Cards"></span>
        <span class="filterName text-nowrap me-1">Graded Cards</span>
    `;

    headerLink.appendChild(h3);
    header.appendChild(headerLink);
    accordionItem.appendChild(header);

    // Collapse body
    const collapseDiv = document.createElement("div");
    collapseDiv.id = accordionId;
    collapseDiv.className = "accordion-collapse collapse";
    // Fresh build has no grader selected: closed, like any unset filter
    setSectionOpen(headerLink, collapseDiv, false);

    const itemBody = document.createElement("div");
    itemBody.className = "item-body-wrapper";

    const filterBox = document.createElement("div");
    filterBox.className = "sellerTypeCheckboxes";

    presentGraders.forEach(grader => {
        const count = graderCounts[grader.name];
        const cbId = `gs-grader-cb-${grader.name.toLowerCase()}`;

        const formCheck = document.createElement("div");
        formCheck.className = "form-check";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = cbId;
        checkbox.className = "form-check-input mb-1 me-2";
        checkbox.style.cursor = "pointer";

        const label = document.createElement("label");
        label.htmlFor = cbId;
        label.className = "d-inline-flex form-check-label";
        label.style.cssText = "cursor: pointer; align-items: center; gap: 6px; user-select: none;";

        // Colored dot
        const dot = document.createElement("span");
        dot.style.cssText = `
            display: inline-block;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: ${grader.color};
            flex-shrink: 0;
            margin-right: 2px;
        `;

        const nameSpan = document.createElement("span");
        nameSpan.textContent = grader.name;
        nameSpan.style.flex = "1";

        const countSpan = document.createElement("span");
        countSpan.textContent = count;
        countSpan.style.cssText = "color: #999; font-size: 12px; margin-left: 4px;";

        label.appendChild(dot);
        label.appendChild(nameSpan);
        label.appendChild(countSpan);
        formCheck.appendChild(checkbox);
        formCheck.appendChild(label);
        filterBox.appendChild(formCheck);

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) filterState.graders.add(grader.name);
            else filterState.graders.delete(grader.name);
            applyVisibility();
        });
    });

    // Select all / Deselect all footer — matches Cardmarket's button row style
    const btnRow = document.createElement("div");
    btnRow.className = "d-flex has-content-centered";
    btnRow.style.marginTop = "4px";

    const selectAllBtn = document.createElement("button");
    selectAllBtn.type = "button";
    selectAllBtn.className = "btn select-all btn-link btn-sm btn-slim";
    selectAllBtn.textContent = "Select all";

    const sep = document.createElement("div");
    sep.textContent = "/";

    const deselectAllBtn = document.createElement("button");
    deselectAllBtn.type = "button";
    deselectAllBtn.className = "btn deselect-all btn-link btn-sm btn-slim";
    deselectAllBtn.textContent = "Deselect all";

    selectAllBtn.addEventListener("click", () => {
        filterBox.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.checked = true;
            filterState.graders.add(cb.id.replace("gs-grader-cb-", "").toUpperCase());
        });
        applyVisibility();
    });

    deselectAllBtn.addEventListener("click", () => {
        filterBox.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
        filterState.graders.clear();
        applyVisibility();
    });

    btnRow.appendChild(selectAllBtn);
    btnRow.appendChild(sep);
    btnRow.appendChild(deselectAllBtn);

    itemBody.appendChild(filterBox);
    itemBody.appendChild(btnRow);
    collapseDiv.appendChild(itemBody);
    accordionItem.appendChild(collapseDiv);

    // Insert as the first item in the accordion so it's prominent
    articleFilters.insertBefore(accordionItem, articleFilters.firstChild);
}

function injectPhotoFilter() {
    const existing = document.getElementById("gs-photo-accordion-item");
    if (existing) existing.remove();

    const articleFilters = document.getElementById("articleFilters");
    if (!articleFilters) return Promise.resolve();

    const accordionId = "articleFilterPhoto";

    const item = document.createElement("div");
    item.id = "gs-photo-accordion-item";
    item.className = "accordion-item";

    const header = document.createElement("div");
    header.className = "accordion-header";

    const headerLink = document.createElement("a");
    headerLink.href = `#${accordionId}`;
    headerLink.setAttribute("data-bs-parent", "#articleFilters");
    headerLink.setAttribute("data-bs-toggle", "collapse");
    headerLink.setAttribute("aria-controls", accordionId);
    headerLink.setAttribute("aria-expanded", "true");

    const h3 = document.createElement("h3");
    h3.className = "h-100 text-nowrap";
    const icon = document.createElement("span");
    icon.className = "fonticon-camera";
    const name = document.createElement("span");
    name.className = "filterName text-nowrap me-1";
    name.textContent = "Photo";
    h3.appendChild(icon);
    h3.appendChild(document.createTextNode(" "));
    h3.appendChild(name);
    headerLink.appendChild(h3);
    header.appendChild(headerLink);
    item.appendChild(header);

    const collapseDiv = document.createElement("div");
    collapseDiv.id = accordionId;
    collapseDiv.className = "accordion-collapse collapse";
    setSectionOpen(headerLink, collapseDiv, false);

    const itemBody = document.createElement("div");
    itemBody.className = "item-body-wrapper";

    const formCheck = document.createElement("div");
    formCheck.className = "form-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "gs-photo-cb";
    checkbox.className = "form-check-input mb-1 me-2";
    checkbox.style.cursor = "pointer";

    const label = document.createElement("label");
    label.htmlFor = "gs-photo-cb";
    label.className = "form-check-label";
    label.style.cssText = "cursor: pointer; user-select: none;";
    label.textContent = "Only listings with photo";

    formCheck.appendChild(checkbox);
    formCheck.appendChild(label);
    itemBody.appendChild(formCheck);
    collapseDiv.appendChild(itemBody);
    item.appendChild(collapseDiv);

    // Right after Graded Cards, or first if that item is absent
    const graded = document.getElementById("gs-filter-accordion-item");
    if (graded && graded.parentNode === articleFilters) {
        graded.after(item);
    } else {
        articleFilters.insertBefore(item, articleFilters.firstChild);
    }

    checkbox.addEventListener("change", () => {
        filterState.photoOnly = checkbox.checked;
        chrome.storage.local.set({ photoOnly: checkbox.checked });
        applyVisibility();
    });

    // Restore persisted state
    return new Promise(resolve =>
        chrome.storage.local.get({ photoOnly: false }, res => {
            filterState.photoOnly = !!res.photoOnly;
            checkbox.checked = filterState.photoOnly;
            setSectionOpen(headerLink, collapseDiv, filterState.photoOnly);
            resolve();
        })
    );
}

/* -----------------------------
     FAVOURITE STARS
------------------------------ */

const STAR_SAVED_COLOR = "#f5c518";

function paintStar(btn, saved) {
    btn.textContent = saved ? "★" : "☆";
    btn.setAttribute("aria-pressed", saved ? "true" : "false");
    btn.style.color = saved ? STAR_SAVED_COLOR : "";
}

function injectStars() {
    for (const listing of currentListings) {
        const row = listing.row;
        if (!row || row.dataset.gsStar) continue;
        const actions = row.querySelector(".actions-container");
        if (!actions) continue;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-sm gs-fav-star";
        btn.title = "Favourite";
        btn.style.cssText = "font-size: 1.2em; line-height: 1; padding: 0 6px; margin-right: 4px;";
        btn.dataset.gsId = listing.id;
        paintStar(btn, false);

        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (btn.getAttribute("aria-pressed") === "true") {
                    await removeFavorite(listing.id);
                } else {
                    await setFavorite(makeFavorite(listing));
                }
            } catch (err) {
                console.error("[Grading Scanner] favourite toggle failed", err);
            }
        });

        // Purely additive: first child of the desktop wrapper (before the form), never inside a form
        const form = actions.querySelector("form");
        const wrapper = form && form.parentElement;
        if (wrapper && wrapper !== actions && actions.contains(wrapper)) {
            wrapper.insertBefore(btn, form);
        } else {
            actions.insertBefore(btn, actions.firstChild);
        }
        row.dataset.gsStar = "1";
    }
}

function refreshStars(favoriteIds) {
    document.querySelectorAll("button.gs-fav-star").forEach(btn => {
        paintStar(btn, favoriteIds.has(btn.dataset.gsId));
    });
}

async function injectAndRefreshStars() {
    injectStars();
    const favs = await getFavorites();
    refreshStars(new Set(favs.map(f => f.id)));
}

if (!globalThis.__gsFavListener) {
    globalThis.__gsFavListener = true;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.favorites && isProductPage()) {
            getFavorites().then(favs => refreshStars(new Set(favs.map(f => f.id))));
        }
    });
}

/* -----------------------------
   JUMP TO HASH + NOTICE
------------------------------ */

let listingsReady = false;

function showNotice(text) {
    document.getElementById("gs-notice")?.remove();
    const container = document.querySelector(".table-body")?.parentElement ||
        document.querySelector(".article-row")?.parentElement;
    const title = document.querySelector(".page-title-container");
    if (!container && !title) {
        console.warn("[Grading Scanner] no place to show notice:", text);
        return;
    }

    const notice = document.createElement("div");
    notice.id = "gs-notice";
    notice.className = "alert alert-warning alert-dismissible";
    notice.setAttribute("role", "alert");
    notice.appendChild(document.createTextNode(text));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn-close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => notice.remove());
    notice.appendChild(close);

    if (container) container.prepend(notice);
    else title.after(notice);
}

function renderOverview() {
    document.getElementById("gs-overview")?.remove();
    if (!isProductPage()) return;
    const { raw, graded: liveGraded } = buildOverview(currentListings);
    const langFilter = languageFilterFromSearch(location.search);
    const lastSeen = currentHistory ? lastSeenByGrade(currentHistory, langFilter) : new Map();
    const graded = gridCells(liveGraded, lastSeen, { showLanguage: langFilter === null || langFilter.length > 1 });
    if (!raw.length && !graded.length) return;

    const header = document.querySelector(".table-header");
    const section = header ? header.parentElement : document.querySelector(".table-body")?.parentElement;
    if (!section || !section.parentElement) return;

    const PRICE_STYLE = "font-variant-numeric: tabular-nums; white-space: nowrap;";
    const GRID_STYLE = "display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 3px; align-items: center;";
    const makeBox = (title) => {
        const d = document.createElement("div");
        d.style.cssText = "flex: 1 1 260px; border: 1px solid var(--bs-border-color, rgba(255,255,255,.15)); border-radius: 6px; padding: 8px 12px; font-size: 13px;";
        const t = document.createElement("div");
        t.className = "small text-muted";
        t.style.cssText = "margin-bottom: 4px;";
        t.textContent = title;
        d.appendChild(t);
        return d;
    };
    const priceSpan = (text) => {
        const p = document.createElement("span");
        p.style.cssText = PRICE_STYLE;
        p.textContent = text;
        return p;
    };

    const box = document.createElement("div");
    box.id = "gs-overview";
    box.style.cssText = "display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;";

    if (raw.length) {
        const rb = makeBox("Raw · lowest price");
        const grid = document.createElement("div");
        grid.style.cssText = GRID_STYLE;
        for (const r of raw) {
            const outer = document.createElement("span");
            outer.className = "article-condition condition-" + r.code.toLowerCase();
            const b = document.createElement("span");
            b.className = "badge";
            b.textContent = r.code;
            // Inline fallback in case the site's condition CSS doesn't apply here
            const col = CONDITION_COLORS[r.code];
            if (col) {
                b.style.backgroundColor = col.bg;
                b.style.color = col.fg;
            }
            outer.appendChild(b);
            grid.appendChild(outer);
            grid.appendChild(priceSpan(r.priceText));
        }
        rb.appendChild(grid);
        box.appendChild(rb);
    }
    if (graded.length) {
        const gb = makeBox("Graded · lowest price");

        // Grader rows (in buildOverview's order) × grade columns (high → low)
        const groups = [];
        for (const g of graded) {
            const last = groups[groups.length - 1];
            if (last && last.grader === g.grader) last.byGrade.set(String(g.grade), g);
            else groups.push({ grader: g.grader, color: g.color, byGrade: new Map([[String(g.grade), g]]) });
        }
        const grades = [...new Set(graded.map(g => String(g.grade)))]
            .sort((a, b) => parseFloat(b) - parseFloat(a));

        const CELL = "padding: 2px 10px 2px 0; text-align: left; white-space: nowrap;";
        const scroller = document.createElement("div");
        scroller.style.cssText = "overflow-x: auto;";
        const table = document.createElement("table");
        table.style.cssText = "border-collapse: collapse;";

        const headRow = table.createTHead().insertRow();
        headRow.appendChild(document.createElement("th"));
        for (const grade of grades) {
            const th = document.createElement("th");
            th.style.cssText = CELL + " font-weight: bold;";
            th.textContent = grade;
            headRow.appendChild(th);
        }

        const body = table.createTBody();
        for (const grp of groups) {
            const tr = body.insertRow();
            const name = document.createElement("th");
            name.scope = "row";
            name.style.cssText = CELL + " font-weight: bold;" + (grp.color ? " color: " + grp.color + ";" : "");
            name.textContent = grp.grader;
            tr.appendChild(name);
            for (const grade of grades) {
                const td = tr.insertCell();
                td.style.cssText = CELL + PRICE_STYLE;
                const cell = grp.byGrade.get(grade);
                if (cell) {
                    td.textContent = cell.priceText;
                    if (cell.faded) {
                        td.style.opacity = "0.55";
                        td.style.fontStyle = "italic";
                        if (cell.title) td.title = cell.title;
                    }
                } else {
                    td.textContent = "–";
                    td.style.opacity = "0.4";
                }
            }
        }

        scroller.appendChild(table);
        gb.appendChild(scroller);
        box.appendChild(gb);
    }

    // Directly above the listings table section, same level as .table-body's container
    section.parentElement.insertBefore(box, section);
}

function safeRenderOverview() {
    try {
        renderOverview();
    } catch (err) {
        console.error("[Grading Scanner] overview failed:", err);
    }
}

function jumpToHash() {
    if (!isProductUrl()) return;
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("articleRow")) return;

    const row = document.getElementById(hash);
    if (!row) {
        showNotice("This listing has been sold or removed.");
        return;
    }
    if (row.dataset.gsHidden === "1") {
        showNotice("This listing is hidden by your filters.");
        return;
    }

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.style.transition = "all 0.6s ease";
    row.style.outline = "2px solid #7c9cbf";
    row.style.borderRadius = "4px";

    setTimeout(() => {
        row.style.outline = "";
        row.style.borderRadius = "";
    }, 2000);
}

window.addEventListener("hashchange", () => {
    if (listingsReady) jumpToHash();
});

/* -----------------------------
      AUTO-SCAN ON PAGE LOAD
------------------------------ */

// One scan, shared by the page-load scan and the popup's SCAN_GRADED.
// The graded scanner (highlights, Graded Cards filter, cache) runs on any
// page with article rows; stars, the photo filter and the overview only on
// product pages. A failing product-only step never aborts the scan.
async function runScan(enabledCompanies) {
    await loadAllResults();
    if (!hasArticleRows()) return [];

    const hits = gradedHits(scanListings(), enabledCompanies);
    const productPage = isProductPage();

    if (productPage) {
        try {
            await injectAndRefreshStars();
        } catch (err) {
            console.error("[Grading Scanner] stars failed:", err);
        }
    }

    // Cache results via background service worker
    // (chrome.storage.session is not available in content scripts)
    chrome.runtime.sendMessage({
        action: "CACHE_SCAN",
        payload: { hits, url: window.location.href, ts: Date.now() }
    });

    if (productPage) {
        try {
            currentHistory = await recordHistory(currentListings);
        } catch (err) {
            console.error("[Grading Scanner] history failed:", err);
        }
    }

    injectPageHighlights(hits);
    injectFilterForm(hits);
    if (productPage) {
        try {
            await injectPhotoFilter();
        } catch (err) {
            console.error("[Grading Scanner] photo filter failed:", err);
        }
    }
    applyVisibility();
    if (productPage) safeRenderOverview();

    return hits;
}

async function autoScan() {
    // Product pages always (a missing target listing is still reported);
    // other pages only when they list articles.
    if (!isProductUrl() && !hasArticleRows()) return;

    try {
        const stored = await new Promise(resolve =>
            chrome.storage.local.get(
                { enabledCompanies: GRADING_PATTERNS.map(p => p.name) },
                res => resolve(res)
            )
        );
        await runScan(stored.enabledCompanies);
    } catch (err) {
        console.error("[Grading Scanner] scan failed:", err);
    } finally {
        listingsReady = true;
        jumpToHash();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoScan);
} else {
    autoScan();
}

/* -----------------------------
     MESSAGE HANDLER (popup)
------------------------------ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "SCAN_GRADED") {
        (async () => {
            try {
                const hits = await runScan(msg.enabledCompanies);
                sendResponse({ success: true, totalGraded: hits.length, gradedHits: hits });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }
});