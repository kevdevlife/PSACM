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
                    <th>Price</th>
                    <th>★</th>
                </tr></thead>
            </table>`;
    } else {
        headWrapper.innerHTML = `
            <table class="scan-table">
                <thead><tr>
                    <th>Condition</th>
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
            ? `<div class="empty-state"><div class="empty-state-icon">⭐</div><div class="empty-state-text">No favourites yet</div></div>`
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
/* -----------------------------
          REMEMBER ME
   Credentials live only in
   chrome.storage.local.rememberMe;
   they are never logged or sent
   anywhere from the popup.
------------------------------ */

{
    const authSection = document.getElementById("authSection");
    const authToggleBtn = document.getElementById("authToggleBtn");
    const authAlert = document.getElementById("authAlert");
    const authEnabled = document.getElementById("authEnabled");
    const authUsername = document.getElementById("authUsername");
    const authPassword = document.getElementById("authPassword");
    const authFailure = document.getElementById("authFailure");
    const authFailureText = document.getElementById("authFailureText");
    const authStatus = document.getElementById("authStatus");
    const authPaused = document.getElementById("authPaused");

    const FAILURE_TEXT = {
        "wrong-credentials": "Sign-in stopped: username or password not accepted.",
        "captcha": "Sign-in stopped: Cardmarket asked for a captcha.",
        "verification": "Sign-in stopped: Cardmarket asked for extra verification.",
        "unknown": "Sign-in stopped: the login could not be completed."
    };

    let record = null;

    function setStatus(text) {
        authStatus.textContent = text;
    }

    function render() {
        authEnabled.checked = !!(record && record.enabled);
        if (document.activeElement !== authUsername) {
            authUsername.value = (record && record.username) || "";
        }
        authPassword.placeholder = record && record.password
            ? "Password saved (leave blank to keep)"
            : "Password";
        const failed = record && record.failed;
        const paused = !!(record && record.paused);
        authFailure.hidden = !failed;
        authPaused.hidden = !paused;
        authAlert.hidden = !failed && !paused;
        authFailureText.textContent = failed ? (FAILURE_TEXT[failed] || FAILURE_TEXT.unknown) : "";
    }

    function load() {
        chrome.storage.local.get("rememberMe", res => {
            record = res.rememberMe || null;
            render();
        });
    }

    authToggleBtn.addEventListener("click", () => {
        const isOpen = authSection.classList.toggle("open");
        authToggleBtn.classList.toggle("active", isOpen);
        if (isOpen) {
            filterSection.classList.remove("open");
            filterToggleBtn.classList.remove("active");
        }
    });

    filterToggleBtn.addEventListener("click", () => {
        if (filterSection.classList.contains("open")) {
            authSection.classList.remove("open");
            authToggleBtn.classList.remove("active");
        }
    });

    // The toggle applies immediately; it does not touch credentials or failure state.
    authEnabled.addEventListener("change", () => {
        const next = Object.assign(
            { username: "", password: "", paused: false, failed: null },
            record || {},
            { enabled: authEnabled.checked }
        );
        chrome.storage.local.set({ rememberMe: next }, () => {
            setStatus(authEnabled.checked ? "Remember me is on." : "Remember me is off.");
        });
    });

    document.getElementById("authSave").addEventListener("click", () => {
        const username = authUsername.value.trim();
        const password = authPassword.value || (record && record.password) || "";
        if (!username || !password) {
            setStatus("Enter a username and password first.");
            return;
        }
        const next = { enabled: authEnabled.checked, username, password, paused: false, failed: null, pendingAttemptAt: null };
        chrome.storage.local.set({ rememberMe: next }, () => {
            authPassword.value = "";
            setStatus("Details saved.");
        });
    });

    document.getElementById("authForget").addEventListener("click", () => {
        chrome.storage.local.remove("rememberMe", () => {
            authPassword.value = "";
            authUsername.value = "";
            setStatus("Details forgotten.");
        });
    });

    // Retry (after a failure) and Resume (after a manual logout) both clear
    // failed/paused via the background's AUTH_RETRY.
    function sendRetry(failText) {
        chrome.runtime.sendMessage({ action: "AUTH_RETRY" }, res => {
            if (chrome.runtime.lastError || !res || !res.ok) {
                setStatus(failText);
                return;
            }
            setStatus("Sign-in will be tried again on the next Cardmarket page load.");
        });
    }

    document.getElementById("authRetry").addEventListener("click", () => sendRetry("Retry failed."));
    document.getElementById("authResume").addEventListener("click", () => sendRetry("Resume failed."));

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.rememberMe) {
            record = changes.rememberMe.newValue || null;
            render();
        }
    });

    load();
}

/* -----------------------------
   PRICE HISTORY EXPORT / IMPORT
   Import is atomic: parse and merge everything first, then one set().
   A native file dialog often closes the action popup (Windows), so from the
   popup Import opens popup.html#import in a tab; there it picks the file.
------------------------------ */

{
    const HIST_PREFIX = "hist:";
    const histCount = document.getElementById("histCount");
    const histMsg = document.getElementById("histMsg");
    const histFile = document.getElementById("histFile");

    function readHistory() {
        return new Promise(resolve => {
            chrome.storage.local.get(null, all => {
                const products = {};
                for (const key of Object.keys(all || {})) {
                    if (key.startsWith(HIST_PREFIX)) products[key.slice(HIST_PREFIX.length)] = all[key];
                }
                resolve(products);
            });
        });
    }

    async function refreshHistCount() {
        const { cards, listings } = historyStats(await readHistory());
        histCount.textContent = `History: ${cards} cards, ${listings} listings`;
    }

    function pad2(n) { return String(n).padStart(2, "0"); }

    document.getElementById("histExport").addEventListener("click", async () => {
        histMsg.textContent = "";
        try {
            const now = new Date();
            const data = buildExport(await readHistory(), now);
            const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cardmarket-graded-history-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            histMsg.textContent = e.message;
        }
    });

    async function importHistoryFile(file) {
        histMsg.textContent = "";
        try {
            const imported = parseImport(await file.text());
            const existing = await readHistory();
            const updates = {};
            for (const [key, rec] of Object.entries(imported)) {
                updates[HIST_PREFIX + key] = mergeRecords(existing[key] || null, rec);
            }
            const n = Object.keys(updates).length;
            await new Promise((resolve, reject) => {
                chrome.storage.local.set(updates, () => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve();
                });
            });
            histMsg.textContent = `Imported ${n} cards`;
            await refreshHistCount();
        } catch (e) {
            histMsg.textContent = e.message;
        }
    }

    const inImportTab = location.hash === "#import";
    document.getElementById("histImport").addEventListener("click", () => {
        histMsg.textContent = "";
        if (!inImportTab) {
            chrome.tabs.create({ url: chrome.runtime.getURL("popup.html#import") });
            return;
        }
        histFile.value = "";
        histFile.click();
    });
    histFile.addEventListener("change", () => {
        const file = histFile.files && histFile.files[0];
        if (file) importHistoryFile(file);
    });

    refreshHistCount();
}
