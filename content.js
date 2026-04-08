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
    // Remove any previously injected badges (re-scan scenario)
    document.querySelectorAll(".gs-grade-badge").forEach(el => el.remove());
    document.querySelectorAll(".article-row").forEach(row => {
        row.style.borderLeft = "";
    });

    gradedHits.forEach(hit => {
        // Find the row by its anchor
        const anchor = document.querySelector(`a[name="${hit.anchorName}"]`);
        if (!anchor) return;
        const row = anchor.closest(".article-row");
        if (!row) return;

        // Colored left border
        row.style.borderLeft = `3px solid ${hit.color}`;
        row.style.paddingLeft = "4px";

        // Grade badge injected next to the seller comment
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
      AUTO-SCAN ON PAGE LOAD
------------------------------ */

async function autoScan() {
    // Only run on article listing pages
    if (!document.querySelector(".article-row")) return;

    await loadAllResults();

    // Read saved company filter from storage
    const stored = await new Promise(resolve =>
        chrome.storage.local.get(
            { enabledCompanies: GRADING_PATTERNS.map(p => p.name) },
            res => resolve(res)
        )
    );

    const gradedHits = scanGradedCards(stored.enabledCompanies);

    // Cache results so popup can read them instantly
    await chrome.storage.session.set({
        lastScan: {
            hits: gradedHits,
            url: window.location.href,
            ts: Date.now()
        }
    });

    // Inject visual highlights into the page
    injectPageHighlights(gradedHits);
}

// Wait for the DOM to settle before scanning
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

                // Update cache
                await chrome.storage.session.set({
                    lastScan: {
                        hits: gradedHits,
                        url: window.location.href,
                        ts: Date.now()
                    }
                });

                injectPageHighlights(gradedHits);
                sendResponse({ success: true, totalGraded: gradedHits.length, gradedHits });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }
});