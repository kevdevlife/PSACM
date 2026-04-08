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

async function getFavorites() {
    return new Promise(resolve => {
        chrome.storage.local.get({ favorites: [] }, res => resolve(res.favorites));
    });
}

async function saveFavorites(favorites) {
    return new Promise(resolve => {
        chrome.storage.local.set({ favorites }, () => resolve());
    });
}

/* -----------------------------
          SORT RESULTS
------------------------------ */

function sortByGradeAndPrice(hits) {
    return hits.sort((a, b) => {
        const gradeA = parseFloat(a.gradeText.match(/[\d.]+/)?.[0] || 0);
        const gradeB = parseFloat(b.gradeText.match(/[\d.]+/)?.[0] || 0);
        if (gradeB !== gradeA) return gradeB - gradeA;

        const priceA = parseFloat(a.price.replace(/[^0-9.,]/g, '').replace(',', '.')) || Infinity;
        const priceB = parseFloat(b.price.replace(/[^0-9.,]/g, '').replace(',', '.')) || Infinity;
        return priceA - priceB;
    });
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
                    <th>Grader</th>
                    <th>Grade</th>
                    <th>Price</th>
                    <th>★</th>
                </tr></thead>
            </table>`;
    } else {
        headWrapper.innerHTML = `
            <table class="scan-table">
                <thead><tr>
                    <th>Grader</th>
                    <th>Grade</th>
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
        hitsToShow = hits.filter(hit => favorites.some(f => f.url === hit.url));
    }

    if (!showOnlyFavs && !isFavorites) {
        hitsToShow = sortByGradeAndPrice([...hitsToShow]);
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

    if (isShowingFavs) {
        html += `<table class="fav-table"><tbody>`;
        hitsToShow.forEach(hit => {
            const isFav = favorites.some(f => f.url === hit.url);
            html += `<tr class="clickable-row" data-url="${hit.url}" data-anchor="${hit.anchorName}">
                <td class="card-name" title="${hit.cardName}">${hit.cardName}</td>
                <td><span class="grader-badge" style="background-color:${hit.color}">${hit.grader}</span></td>
                <td class="grade">${hit.gradeText}</td>
                <td class="price">${hit.price}</td>
                <td style="text-align:center"><a href="#" class="favStar" data-url="${hit.url}">${isFav ? '★' : '☆'}</a></td>
            </tr>`;
        });
        html += `</tbody></table>`;
    } else {
        html += `<table class="scan-table"><tbody>`;
        hitsToShow.forEach(hit => {
            const isFav = favorites.some(f => f.url === hit.url);
            html += `<tr class="clickable-row" data-url="${hit.url}" data-anchor="${hit.anchorName}">
                <td><span class="grader-badge" style="background-color:${hit.color}">${hit.grader}</span></td>
                <td class="grade">${hit.gradeText}</td>
                <td class="price">${hit.price}</td>
                <td style="text-align:center"><a href="#" class="favStar" data-url="${hit.url}">${isFav ? '★' : '☆'}</a></td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

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
            const url = link.dataset.url;
            let favs = await getFavorites();
            const existing = favs.find(f => f.url === url);

            if (existing) {
                favs = favs.filter(f => f.url !== url);
                link.innerHTML = '☆';
            } else {
                const hitData = hits.find(h => h.url === url);
                if (hitData) favs.push(hitData);
                link.innerHTML = '★';
            }

            await saveFavorites(favs);
            if (showOnlyFavs) renderTable(favs, true);
        });
    });
}

/* -----------------------------
     LOAD CACHED SCAN ON OPEN
------------------------------ */

(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const session = await chrome.storage.session.get("lastScan");
    const cached = session.lastScan;

    // Use cache if it's for the current page and under 5 minutes old
    if (cached && cached.url === tab.url && Date.now() - cached.ts < 5 * 60 * 1000) {
        lastGradedHits = cached.hits;
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
                    <div class="empty-state-text">Error: ${chrome.runtime.lastError.message}</div>
                </div>`;
                return;
            }
            if (!response || response.error) {
                clearStickyHeader();
                out.className = "output-container no-table";
                out.innerHTML = `<div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div class="empty-state-text">${response?.error || "No response from page"}</div>
                </div>`;
                return;
            }

            const { gradedHits } = response;
            lastGradedHits = gradedHits;
            renderTable(gradedHits);
        }
    );
});