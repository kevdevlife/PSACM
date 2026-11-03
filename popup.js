let showOnlyFavs = false;
let lastGradedHits = [];

const out = document.getElementById("output");
const wrapper = document.getElementById("resultsWrapper");
const toggleBtn = document.getElementById("toggleFavs");

/* -----------------------------
       FILTER PANEL TOGGLE
------------------------------ */

const filterSection = document.getElementById("filterSection");
const filterToggleBtn = document.getElementById("filterToggleBtn");
const filterCount = document.getElementById("filterCount");

filterToggleBtn.addEventListener("click", () => {
    const isOpen = filterSection.classList.toggle("open");
    filterToggleBtn.classList.toggle("active", isOpen);
});

function updateFilterCount() {
    const count = getEnabledCompanies().length;
    filterCount.textContent = count;
    filterToggleBtn.classList.toggle("active", filterSection.classList.contains("open"));
}

/* -----------------------------
       COMPANY FILTER STATE
------------------------------ */

const companyCheckboxes = {
    PSA: document.getElementById("psa"),
    CGC: document.getElementById("cgc"),
    BGS: document.getElementById("bgs"),
    TAG: document.getElementById("tag"),
    ACE: document.getElementById("ace"),
    MNT: document.getElementById("mnt"),
    SGC: document.getElementById("sgc")
};

// Load saved filter preferences
chrome.storage.local.get({ enabledCompanies: Object.keys(companyCheckboxes) }, res => {
    Object.keys(companyCheckboxes).forEach(company => {
        companyCheckboxes[company].checked = res.enabledCompanies.includes(company);
    });
    updateFilterCount();
});

// Save filter preferences on change
Object.values(companyCheckboxes).forEach(checkbox => {
    checkbox.addEventListener("change", () => {
        const enabled = getEnabledCompanies();
        chrome.storage.local.set({ enabledCompanies: enabled });
        updateFilterCount();
    });
});

document.getElementById("selectAll").addEventListener("click", () => {
    Object.values(companyCheckboxes).forEach(cb => cb.checked = true);
    chrome.storage.local.set({ enabledCompanies: getEnabledCompanies() });
    updateFilterCount();
});

document.getElementById("deselectAll").addEventListener("click", () => {
    Object.values(companyCheckboxes).forEach(cb => cb.checked = false);
    chrome.storage.local.set({ enabledCompanies: getEnabledCompanies() });
    updateFilterCount();
});

function getEnabledCompanies() {
    return Object.entries(companyCheckboxes)
        .filter(([_, cb]) => cb.checked)
        .map(([name]) => name);
}

/* -----------------------------
            FAVORITES
------------------------------ */

/* -----------------------------
          SORT RESULTS
------------------------------ */

function sortByPrice(hits) {
    const p = h => parsePrice(h.priceText);
    return hits.sort((a, b) => {
        const pa = p(a), pb = p(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
    });
}

function conditionCell(c) {
    if (c.type === "graded") {
        return `<span class="grader-badge" style="background-color:${escapeHtml(c.color)}">${escapeHtml(c.gradeText)}</span>`;
    }
    const col = CONDITION_COLORS[c.code] || { bg: "#555", fg: "#fff" };
    return `<span class="grader-badge" style="background-color:${escapeHtml(col.bg)};color:${escapeHtml(col.fg)}">${escapeHtml(c.code)}</span>`;
}

/* -----------------------------
     STICKY HEADER HELPERS
------------------------------ */

// Remove any existing sticky stats/thead injected into wrapper
function clearStickyHeader() {
    wrapper.querySelectorAll(".stats-bar, .table-head-wrapper").forEach(el => el.remove());
}

function injectStickyHeader(count, isFavorites) {
    clearStickyHeader();

    // Stats bar
    const statsBar = document.createElement("div");
    statsBar.className = "stats-bar";
    statsBar.innerHTML = `<b>${isFavorites ? "Favorites" : "Total Results"}</b><span class="stats-number">${count}</span>`;
    wrapper.insertBefore(statsBar, out);

    // thead wrapper
    const headWrapper = document.createElement("div");
    headWrapper.className = "table-head-wrapper";

    if (isFavorites) {
        headWrapper.innerHTML = `
            <table class="fav-table">
                <thead><tr>
                    <th>Card</th>
                    <th>Condition</th>
                    <th>Seller</th>
                    <th>Price</th>
                    <th>★</th>
                </tr></thead>
            </table>`;
    } else {
        headWrapper.innerHTML = `
            <table class="scan-table">
                <thead><tr>
                    <th>Condition</th>
                    <th>Seller</th>
                    <th>Price</th>
                    <th>★</th>
                </tr></thead>
            </table>`;
    }

    wrapper.insertBefore(headWrapper, out);
}

/* -----------------------------
           RENDER TABLE
------------------------------ */

async function renderTable(hits, isFavorites = false) {
    const favorites = await getFavorites();
    let hitsToShow = hits;

    if (showOnlyFavs && !isFavorites) {
        hitsToShow = hits.filter(hit => favorites.some(f => f.id === hit.id));
    }

    if (!showOnlyFavs && !isFavorites) {
        hitsToShow = sortByPrice([...hitsToShow]);
    }

    // Empty state
    if (!hitsToShow || hitsToShow.length === 0) {
        clearStickyHeader();
        out.className = "output-container no-table";
        out.innerHTML = showOnlyFavs
            ? `<div class="empty-state"><div class="empty-state-icon">⭐</div><div class="empty-state-text">No favorite graded cards yet</div></div>`
            : `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No graded cards found</div></div>`;
        return;
    }

    // Inject sticky stats + thead
    const isShowingFavs = showOnlyFavs || isFavorites;
    injectStickyHeader(hitsToShow.length, isShowingFavs);
    out.className = "output-container";

    // Build tbody-only table (no thead here — that's in the sticky wrapper)
    let html = "";

    html += `<table class="${isShowingFavs ? "fav-table" : "scan-table"}"><tbody>`;
    hitsToShow.forEach(hit => {
        const isFav = favorites.some(f => f.id === hit.id);
        const card = isShowingFavs
            ? `<td class="card-name" title="${escapeHtml(hit.cardName)}">${escapeHtml(hit.cardName)}</td>`
            : "";
        html += `<tr class="clickable-row" data-url="${escapeHtml(hit.url)}">
            ${card}
            <td>${conditionCell(hit.condition)}</td>
            <td class="seller" title="${escapeHtml(hit.seller)}">${escapeHtml(hit.seller)}</td>
            <td class="price">${escapeHtml(hit.priceText)}</td>
            <td style="text-align:center"><a href="#" class="favStar" data-id="${escapeHtml(hit.id)}">${isFav ? '★' : '☆'}</a></td>
        </tr>`;
    });
    html += `</tbody></table>`;

    out.innerHTML = html;

    /* ---- ROW CLICK → NAVIGATE ---- */
    out.querySelectorAll(".clickable-row").forEach(row => {
        row.addEventListener("click", async e => {
            // Don't navigate if the star was clicked
            if (e.target.closest(".favStar")) return;

            const jumpUrl = new URL(row.dataset.url);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentUrl = new URL(tab.url);

            const sameBase =
                currentUrl.origin === jumpUrl.origin &&
                currentUrl.pathname === jumpUrl.pathname;

            if (sameBase) {
                chrome.tabs.update(tab.id, { url: jumpUrl.toString() });
            } else {
                chrome.tabs.create({ url: jumpUrl.toString() });
            }
        });
    });

    /* ---- FAVORITE TOGGLE ---- */
    out.querySelectorAll(".favStar").forEach(link => {
        link.addEventListener("click", async e => {
            e.preventDefault();
            const id = link.dataset.id;
            const favs = await getFavorites();

            if (favs.some(f => f.id === id)) {
                await removeFavorite(id);
                link.innerHTML = '☆';
            } else {
                const hitData = hits.find(h => h.id === id);
                if (hitData) await setFavorite(hitData);
                link.innerHTML = '★';
            }

            if (showOnlyFavs) renderTable(await getFavorites(), true);
        });
    });
}

/* -----------------------------
     LOAD CACHED SCAN ON OPEN
------------------------------ */

(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.runtime.sendMessage({ action: "GET_SCAN" });
    const cached = res?.lastScan;

    // Use cache if it's for the current page and under 5 minutes old
    if (cached && cached.url === tab.url && Date.now() - cached.ts < 5 * 60 * 1000) {
        lastGradedHits = cached.hits.filter(isValidFavorite);
        renderTable(lastGradedHits);
    }
})();

/* -----------------------------
         FAVORITES FILTER
------------------------------ */

toggleBtn.addEventListener("click", async () => {
    showOnlyFavs = !showOnlyFavs;
    toggleBtn.textContent = showOnlyFavs ? "Show All" : "Favorites";

    if (showOnlyFavs) {
        const favorites = await getFavorites();
        renderTable(favorites, true);
    } else {
        renderTable(lastGradedHits);
    }
});

/* -----------------------------
             SCAN
------------------------------ */

document.getElementById("scan").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const enabledCompanies = getEnabledCompanies();

    if (enabledCompanies.length === 0) {
        clearStickyHeader();
        out.className = "output-container no-table";
        out.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-text">Please select at least one grading company</div>
        </div>`;
        return;
    }

    clearStickyHeader();
    out.className = "output-container no-table";
    out.innerHTML = `<div class="loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">Scanning page for graded cards...</div>
    </div>`;

    // Close filter panel on scan
    filterSection.classList.remove("open");
    filterToggleBtn.classList.remove("active");

    chrome.tabs.sendMessage(
        tab.id,
        { action: "SCAN_GRADED", enabledCompanies },
        async response => {
            if (chrome.runtime.lastError) {
                clearStickyHeader();
                out.className = "output-container no-table";
                out.innerHTML = `<div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div class="empty-state-text">Error: ${escapeHtml(chrome.runtime.lastError.message)}</div>
                </div>`;
                return;
            }
            if (!response || response.error) {
                clearStickyHeader();
                out.className = "output-container no-table";
                out.innerHTML = `<div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div class="empty-state-text">${escapeHtml(response?.error || "No response from page")}</div>
                </div>`;
                return;
            }

            const { gradedHits } = response;
            lastGradedHits = gradedHits.filter(isValidFavorite);
            renderTable(lastGradedHits);
        }
    );
});