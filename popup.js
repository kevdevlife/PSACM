let showOnlyFavs = false;
let lastGradedHits = [];

const out = document.getElementById("output");
const toggleBtn = document.getElementById("toggleFavs");

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
});

// Save filter preferences on change
Object.values(companyCheckboxes).forEach(checkbox => {
    checkbox.addEventListener("change", () => {
        const enabled = getEnabledCompanies();
        chrome.storage.local.set({ enabledCompanies: enabled });
    });
});

// Select/Deselect all buttons
document.getElementById("selectAll").addEventListener("click", () => {
    Object.values(companyCheckboxes).forEach(cb => cb.checked = true);
    const enabled = getEnabledCompanies();
    chrome.storage.local.set({ enabledCompanies: enabled });
});

document.getElementById("deselectAll").addEventListener("click", () => {
    Object.values(companyCheckboxes).forEach(cb => cb.checked = false);
    const enabled = getEnabledCompanies();
    chrome.storage.local.set({ enabledCompanies: enabled });
});

function getEnabledCompanies() {
    return Object.entries(companyCheckboxes)
        .filter(([_, checkbox]) => checkbox.checked)
        .map(([company, _]) => company);
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
        // Extract numeric grade from gradeText (e.g., "PSA 10" -> 10, "BGS 9.5" -> 9.5)
        const gradeA = parseFloat(a.gradeText.match(/[\d.]+/)?.[0] || 0);
        const gradeB = parseFloat(b.gradeText.match(/[\d.]+/)?.[0] || 0);
        
        // Sort by grade descending (higher grades first)
        if (gradeB !== gradeA) {
            return gradeB - gradeA;
        }
        
        // If grades are equal, sort by price ascending (cheaper first)
        const priceA = parseFloat(a.price.replace(/[^0-9.,]/g, '').replace(',', '.')) || Infinity;
        const priceB = parseFloat(b.price.replace(/[^0-9.,]/g, '').replace(',', '.')) || Infinity;
        
        return priceA - priceB;
    });
}

/* -----------------------------
           RENDER TABLE
------------------------------ */

async function renderTable(hits, isFavorites = false) {
    const favorites = await getFavorites();
    let hitsToShow = hits;

    if (showOnlyFavs && !isFavorites) {
        hitsToShow = hits.filter(hit =>
            favorites.some(f => f.url === hit.url)
        );
    }
    
    // Sort regular results by grade (desc) then price (asc)
    // Don't sort favorites view - keep them in order added
    if (!showOnlyFavs && !isFavorites) {
        hitsToShow = sortByGradeAndPrice([...hitsToShow]);
    }

    if (!hitsToShow || hitsToShow.length === 0) {
        out.innerHTML = showOnlyFavs
            ? "<b>No favorite graded cards.</b>"
            : "<b>No graded results found.</b>";
        return;
    }

    let html = `<p><b>Total hits:</b> ${hitsToShow.length}</p>`;
    
    // Show card name column only for favorites
    if (showOnlyFavs || isFavorites) {
        html += `<table>
            <tr>
                <th>Card</th>
                <th>Grader</th>
                <th>Grade</th>
                <th>Price</th>
                <th>Jump</th>
                <th>★</th>
            </tr>`;

        hitsToShow.forEach(hit => {
            const isFav = favorites.some(f => f.url === hit.url);
            html += `<tr>
                <td>${hit.cardName}</td>
                <td><span class="grader-badge" style="background-color: ${hit.color}">${hit.grader}</span></td>
                <td class="grade">${hit.gradeText}</td>
                <td>${hit.price}</td>
                <td><a href="${hit.url}" class="jumpLink" data-anchor="${hit.anchorName}">&#8594;</a></td>
                <td><a href="#" class="favStar" data-url="${hit.url}">${isFav ? '&#9733;' : '&#9734;'}</a></td>
            </tr>`;
        });
    } else {
        // No card name column for regular scan results
        html += `<table>
            <tr>
                <th>Grader</th>
                <th>Grade</th>
                <th>Price</th>
                <th>Jump</th>
                <th>★</th>
            </tr>`;

        hitsToShow.forEach(hit => {
            const isFav = favorites.some(f => f.url === hit.url);
            html += `<tr>
                <td><span class="grader-badge" style="background-color: ${hit.color}">${hit.grader}</span></td>
                <td class="grade">${hit.gradeText}</td>
                <td>${hit.price}</td>
                <td><a href="${hit.url}" class="jumpLink" data-anchor="${hit.anchorName}">&#8594;</a></td>
                <td><a href="#" class="favStar" data-url="${hit.url}">${isFav ? '&#9733;' : '&#9734;'}</a></td>
            </tr>`;
        });
    }

    html += "</table>";
    out.innerHTML = html;

    /* -----------------------------
               JUMP LINKS
    ------------------------------ */
    out.querySelectorAll(".jumpLink").forEach(link => {
        link.addEventListener("click", async e => {
            e.preventDefault();

            const jumpUrl = new URL(link.href);
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

    /* -----------------------------
            FAVORITE TOGGLE
    ------------------------------ */
    out.querySelectorAll(".favStar").forEach(link => {
        link.addEventListener("click", async e => {
            e.preventDefault();
            const url = link.dataset.url;
            let favs = await getFavorites();

            const existing = favs.find(f => f.url === url);

            if (existing) {
                favs = favs.filter(f => f.url !== url);
                link.innerHTML = '&#9734;';
            } else {
                const hitData = hits.find(h => h.url === url);
                if (hitData) favs.push(hitData);
                link.innerHTML = '&#9733;';
            }

            await saveFavorites(favs);

            if (showOnlyFavs) renderTable(favs, true);
        });
    });
}

/* -----------------------------
         FAVORITES FILTER
------------------------------ */

toggleBtn.addEventListener("click", async () => {
    showOnlyFavs = !showOnlyFavs;
    toggleBtn.textContent = showOnlyFavs ? "Show All" : "Show Favorites";

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
        out.innerHTML = "<b>Please select at least one grading company to scan.</b>";
        return;
    }
    
    out.innerHTML = "Scanning... please wait.";

    chrome.tabs.sendMessage(
        tab.id, 
        { action: "SCAN_GRADED", enabledCompanies }, 
        async response => {
            if (chrome.runtime.lastError) {
                out.innerHTML = "Error: " + chrome.runtime.lastError.message;
                return;
            }
            if (!response || response.error) {
                out.innerHTML = response?.error || "No response from page.";
                return;
            }

            const { gradedHits } = response;
            lastGradedHits = gradedHits;
            renderTable(gradedHits);
        }
    );
});