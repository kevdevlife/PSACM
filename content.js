console.log("[Grading Scanner] content script active");
console.log("window.location.hash", window.location.hash);

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

    if (typeof loadAllResults === "function") {
        await loadAllResults();
    }

    const links = document.querySelectorAll(".seller-name a");
    const match = Array.from(links).find(
        link => link.textContent.trim().toLowerCase() === sellerAnchor.toLowerCase()
    );
    if (!match) return;

    const row = match.closest(".article-row");
    if (!row) return;

    row.scrollIntoView({ behavior: "smooth", block: "center" });

    row.style.transition = "all 0.6s ease";
    row.style.backgroundColor = "#ffef9f";
    row.style.border = "2px solid #ffb347";
    row.style.borderRadius = "4px";

    setTimeout(() => {
        row.style.backgroundColor = "";
        row.style.border = "";
        row.style.borderRadius = "";
    }, 2000);
}

/* Run immediately (load event often never fires in content scripts) */
scrollToSellerFromHash();

/* Also react when popup updates the hash */
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

    // If no filter specified, use all companies
    const companiesToScan = enabledCompanies 
        ? GRADING_PATTERNS.filter(p => enabledCompanies.includes(p.name))
        : GRADING_PATTERNS;

    rows.forEach((row, index) => {
        const commentSpan = row.querySelector(".product-comments > div > span");
        if (!commentSpan) return;

        const text = commentSpan.innerText.toLowerCase();
        
        // Check each grading company
        for (const grader of companiesToScan) {
            const match = text.match(grader.pattern);
            if (!match) continue;

            const priceElement = row.querySelector(".price-container .text-end");
            const price = priceElement
                ? priceElement.textContent.trim()
                : "N/A";

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

            // Only match once per row (first grading company found)
            break;
        }
    });

    return results;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "SCAN_GRADED") {
        (async () => {
            try {
                await loadAllResults();
                const gradedHits = scanGradedCards(msg.enabledCompanies);
                sendResponse({ success: true, totalGraded: gradedHits.length, gradedHits });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }
});