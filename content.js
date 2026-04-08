console.log("[Grading Scanner] content script active");

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* -----------------------------
   GRADING COMPANIES CONFIG
------------------------------ */

const GRADING_PATTERNS = [
    { name: "PSA", pattern: /psa\s*(?:10|[1-9])/i, color: "#d9534f" },
    { name: "CGC", pattern: /cgc\s*(?:10|9\.5|[1-9](?:\.\d)?)/i, color: "#ff6b35" },
    { name: "BGS", pattern: /(?:bgs|beckett)\s*(?:10|9\.5|[1-9](?:\.\d)?)/i, color: "#f7931e" },
    { name: "TAG", pattern: /tag\s*(?:10|[1-9])/i, color: "#4a90e2" },
    { name: "ACE", pattern: /ace\s*(?:10|[1-9])/i, color: "#50c878" },
    { name: "MNT", pattern: /mnt\s*(?:10|[1-9])/i, color: "#9b59b6" },
    { name: "SGC", pattern: /sgc\s*(?:10|[1-9])/i, color: "#e74c3c" }
];

/* -----------------------------
   SCROLL + HIGHLIGHT HANDLER
------------------------------ */

async function scrollToSellerFromHash() {
    const sellerAnchor = window.location.hash.slice(1);
    if (!sellerAnchor) return;

    const links = document.querySelectorAll(".seller-name a");
    const match = Array.from(links).find(
        link => link.textContent.trim().toLowerCase() === sellerAnchor.toLowerCase()
    );
    if (!match) return;

    const row = match.closest(".article-row");
    if (!row) return;

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

    const companiesToScan = enabledCompanies
        ? GRADING_PATTERNS.filter(p => enabledCompanies.includes(p.name))
        : GRADING_PATTERNS;

    rows.forEach((row, index) => {
        const commentSpan = row.querySelector(".product-comments > div > span");
        if (!commentSpan) return;

        const text = commentSpan.innerText.toLowerCase();

        for (const grader of companiesToScan) {
            const match = text.match(grader.pattern);
            if (!match) continue;

            const priceElement = row.querySelector(".price-container .text-end");
            const price = priceElement ? priceElement.textContent.trim() : "N/A";

            const sellerLink = row.querySelector(".seller-name a");
            const sellerText = sellerLink
                ? sellerLink.textContent.trim().toLowerCase()
                : `row${index}`;

            let a = row.querySelector(`a[name="${sellerText}"]`);
            if (!a) {
                a = document.createElement("a");
                a.name = sellerText;
                a.href = `#${sellerText}`;
                row.prepend(a);
            }

            results.push({
                anchorName: sellerText,
                cardName,
                price,
                grader: grader.name,
                gradeText: match[0].toUpperCase().replace(/\s+/g, " "),
                color: grader.color,
                url: a.href
            });

            break;
        }
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
        const anchor = document.querySelector(`a[name="${hit.anchorName}"]`);
        if (!anchor) return;
        const row = anchor.closest(".article-row");
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
    const existing = document.getElementById("gs-filter-section");
    if (existing) existing.remove();

    const filterForm = document.getElementById("FilterForm");
    if (!filterForm) return;

    // Count hits per grader
    const graderCounts = {};
    gradedHits.forEach(hit => {
        graderCounts[hit.grader] = (graderCounts[hit.grader] || 0) + 1;
    });

    // Only include graders that actually appear in results
    const presentGraders = GRADING_PATTERNS.filter(p => graderCounts[p.name]);
    if (presentGraders.length === 0) return;

    const section = document.createElement("div");
    section.id = "gs-filter-section";
    section.style.cssText = `
        border-top: 1px solid #dee2e6;
        padding: 12px 0 4px;
        margin-top: 4px;
    `;

    // Section heading with total count — mirrors Cardmarket filter heading style
    const heading = document.createElement("p");
    heading.style.cssText = `
        font-size: 13px;
        font-weight: 600;
        color: #333;
        margin: 0 0 8px;
        display: flex;
        align-items: center;
        gap: 6px;
    `;
    heading.innerHTML = `
        Graded Cards
        <span style="
            background: #6c757d;
            color: #fff;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 3px;
            font-family: monospace;
            letter-spacing: 0.3px;
        ">${gradedHits.length}</span>
    `;
    section.appendChild(heading);

    const activeGraders = new Set();

    presentGraders.forEach(grader => {
        const count = graderCounts[grader.name];

        const label = document.createElement("label");
        label.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            cursor: pointer;
            font-size: 13px;
            color: #333;
            user-select: none;
        `;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.style.cssText = "cursor: pointer; width: 14px; height: 14px; margin: 0; flex-shrink: 0;";

        // Color dot matching the grader badge color
        const dot = document.createElement("span");
        dot.style.cssText = `
            display: inline-block;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: ${grader.color};
            flex-shrink: 0;
        `;

        const nameSpan = document.createElement("span");
        nameSpan.textContent = grader.name;
        nameSpan.style.flex = "1";

        const countSpan = document.createElement("span");
        countSpan.textContent = count;
        countSpan.style.cssText = "color: #999; font-size: 12px;";

        label.appendChild(checkbox);
        label.appendChild(dot);
        label.appendChild(nameSpan);
        label.appendChild(countSpan);
        section.appendChild(label);

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) activeGraders.add(grader.name);
            else activeGraders.delete(grader.name);
            applyGraderFilter(activeGraders);
        });
    });

    // "Show all" reset link
    const reset = document.createElement("a");
    reset.textContent = "Show all";
    reset.href = "#";
    reset.style.cssText = `
        font-size: 12px;
        color: #007bff;
        display: block;
        margin-top: 6px;
        margin-bottom: 4px;
        text-decoration: none;
    `;
    reset.addEventListener("mouseover", () => reset.style.textDecoration = "underline");
    reset.addEventListener("mouseout",  () => reset.style.textDecoration = "none");
    reset.addEventListener("click", e => {
        e.preventDefault();
        section.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
        activeGraders.clear();
        applyGraderFilter(activeGraders);
    });
    section.appendChild(reset);

    filterForm.appendChild(section);
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