console.log("[Grading Scanner] content script active");

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* -----------------------------
   SCROLL + HIGHLIGHT HANDLER
------------------------------ */

async function scrollToSellerFromHash() {
    const rowId = window.location.hash.slice(1);
    if (!rowId) return;

    const row = document.getElementById(rowId);
    if (!row || !row.classList.contains("article-row")) return;

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.style.transition = "all 0.6s ease";
    row.style.outline = "2px solid #7c9cbf";
    row.style.borderRadius = "4px";

    setTimeout(() => {
        row.style.outline = "";
        row.style.borderRadius = "";
    }, 2000);
}

scrollToSellerFromHash();
window.addEventListener("hashchange", scrollToSellerFromHash);



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

function scanGradedCards(enabledCompanies = null) {
    const results = [];
    const rows = document.querySelectorAll(".article-row");
    const cardName =
        document.querySelector(".page-title-container > div > h1")?.innerText?.trim() ||
        "Unknown";

    rows.forEach((row) => {
        const commentSpan = row.querySelector(".product-comments > div > span");
        if (!commentSpan) return;
        if (!row.id) return; // no stable reference point to link back to

        const text = commentSpan.innerText.toLowerCase();

        const grade = detectGrade(text, enabledCompanies);
        if (!grade) return;

        const priceElement = row.querySelector(".price-container .text-end");
        const price = priceElement ? priceElement.textContent.trim() : "N/A";

        // Cardmarket gives every listing row its own unique id, so this
        // anchor points at this exact listing even when the same seller
        // has multiple listings for the card.
        const url = new URL(window.location.href);
        url.hash = row.id;

        results.push({
            anchorName: row.id,
            cardName,
            price,
            grader: grade.grader,
            gradeText: grade.gradeText,
            color: grade.color,
            url: url.toString()
        });
    });

    return results;
}

/* -----------------------------
      PAGE INJECTION / BADGES
------------------------------ */

function injectPageHighlights(gradedHits) {
    // Clean up previous run
    document.querySelectorAll(".gs-grade-badge").forEach(el => el.remove());
    document.querySelectorAll(".article-row").forEach(row => {
        row.style.borderLeft = "";
        row.style.paddingLeft = "";
        delete row.dataset.gsGrader;
    });

    gradedHits.forEach(hit => {
        const row = document.getElementById(hit.anchorName);
        if (!row) return;

        // Tag row with grader so the filter can show/hide it
        row.dataset.gsGrader = hit.grader;

        // Colored left border
        row.style.borderLeft = `3px solid ${hit.color}`;
        row.style.paddingLeft = "4px";

        // Grade badge next to the seller comment
        const commentSpan = row.querySelector(".product-comments > div > span");
        if (commentSpan && !commentSpan.querySelector(".gs-grade-badge")) {
            const badge = document.createElement("span");
            badge.className = "gs-grade-badge";
            badge.textContent = hit.gradeText;
            badge.style.cssText = `
                display: inline-block;
                margin-left: 6px;
                padding: 1px 6px;
                border-radius: 3px;
                background: ${hit.color};
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                font-family: monospace;
                vertical-align: middle;
                letter-spacing: 0.3px;
            `;
            commentSpan.appendChild(badge);
        }
    });
}

/* -----------------------------
    FILTER FORM INJECTION
------------------------------ */

function applyGraderFilter(activeGraders) {
    document.querySelectorAll(".article-row").forEach(row => {
        const grader = row.dataset.gsGrader;

        if (activeGraders.size === 0) {
            // Nothing checked — show everything
            row.style.display = "";
            return;
        }

        if (!grader) {
            // Ungraded row — hide when a grader filter is active
            row.style.display = "none";
            return;
        }

        row.style.display = activeGraders.has(grader) ? "" : "none";
    });
}

function injectFilterForm(gradedHits) {
    // Remove stale injection on re-scan
    const existing = document.getElementById("gs-filter-accordion-item");
    if (existing) existing.remove();

    const articleFilters = document.getElementById("articleFilters");
    if (!articleFilters) return;

    // Count hits per grader
    const graderCounts = {};
    gradedHits.forEach(hit => {
        graderCounts[hit.grader] = (graderCounts[hit.grader] || 0) + 1;
    });

    // Only include graders that actually appear in results
    const presentGraders = GRADING_PATTERNS.filter(p => graderCounts[p.name]);
    if (presentGraders.length === 0) return;

    const activeGraders = new Set();
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
    collapseDiv.className = "accordion-collapse collapse show";

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
            if (checkbox.checked) activeGraders.add(grader.name);
            else activeGraders.delete(grader.name);
            applyGraderFilter(activeGraders);
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
            activeGraders.add(cb.id.replace("gs-grader-cb-", "").toUpperCase());
        });
        applyGraderFilter(activeGraders);
    });

    deselectAllBtn.addEventListener("click", () => {
        filterBox.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
        activeGraders.clear();
        applyGraderFilter(activeGraders);
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

/* -----------------------------
      AUTO-SCAN ON PAGE LOAD
------------------------------ */

async function autoScan() {
    if (!document.querySelector(".article-row")) return;

    await loadAllResults();

    const stored = await new Promise(resolve =>
        chrome.storage.local.get(
            { enabledCompanies: GRADING_PATTERNS.map(p => p.name) },
            res => resolve(res)
        )
    );

    const gradedHits = scanGradedCards(stored.enabledCompanies);

    // Cache results via background service worker
    // (chrome.storage.session is not available in content scripts)
    chrome.runtime.sendMessage({
        action: "CACHE_SCAN",
        payload: { hits: gradedHits, url: window.location.href, ts: Date.now() }
    });

    injectPageHighlights(gradedHits);
    injectFilterForm(gradedHits);
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
                await loadAllResults();
                const gradedHits = scanGradedCards(msg.enabledCompanies);

                chrome.runtime.sendMessage({
                    action: "CACHE_SCAN",
                    payload: { hits: gradedHits, url: window.location.href, ts: Date.now() }
                });

                injectPageHighlights(gradedHits);
                injectFilterForm(gradedHits);
                sendResponse({ success: true, totalGraded: gradedHits.length, gradedHits });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }
});