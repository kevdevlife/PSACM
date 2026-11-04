(function (root) {
    const CONDITION_ORDER = ["MT", "NM", "EX", "GD", "LP", "PL", "PO"];

    function parsePrice(text) {
        if (typeof text !== "string") return null;
        const m = text.match(/\d[\d.]*(?:,\d+)?/);
        if (!m) return null;
        const n = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
    }

    function buildOverview(listings) {
        const patterns = typeof module !== "undefined" && module.exports
            ? require("./grading.js").GRADING_PATTERNS
            : root.GRADING_PATTERNS;

        const rawBest = new Map();
        const gradedBest = new Map();
        for (const l of listings) {
            if (l.price === null || l.price === undefined) continue;
            if (l.grade === null || l.grade === undefined) {
                const cur = rawBest.get(l.conditionCode);
                if (!cur || l.price < cur.price) rawBest.set(l.conditionCode, l);
            } else {
                const cur = gradedBest.get(l.grade.gradeText);
                if (!cur || l.price < cur.price) gradedBest.set(l.grade.gradeText, l);
            }
        }

        const raw = CONDITION_ORDER.filter((c) => rawBest.has(c))
            .map((code) => ({ code, priceText: rawBest.get(code).priceText }));

        const graderIndex = (name) => patterns.findIndex((p) => p.name === name);
        const graded = [...gradedBest.values()]
            .map((l) => ({
                gradeText: l.grade.gradeText,
                grader: l.grade.grader,
                grade: l.grade.grade,
                color: l.grade.color,
                priceText: l.priceText,
                id: l.id
            }))
            .sort((a, b) => graderIndex(a.grader) - graderIndex(b.grader) || parseFloat(b.grade) - parseFloat(a.grade));

        return { raw, graded };
    }

    function formatPrice(n) {
        const [int, dec] = Math.abs(n).toFixed(2).split(".");
        return (n < 0 ? "-" : "") + int.replace(/\B(?=(\d{3})+$)/g, ".") + "," + dec + " €";
    }

    const api = { CONDITION_ORDER, parsePrice, buildOverview, formatPrice };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
