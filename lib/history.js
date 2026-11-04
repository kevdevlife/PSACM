(function (root) {
    const LANGUAGE_CODES = { 1: "en", 2: "fr", 3: "de", 4: "es", 5: "it", 6: "zh-cn", 7: "ja", 8: "pt", 9: "ru", 10: "ko", 11: "zh-tw", 12: "nl" };

    function productKeyFromUrl(url) {
        let path;
        try { path = new URL(url).pathname; } catch (e) { return null; }
        const parts = path.split("/").filter(Boolean);
        parts.shift(); // locale
        if (parts[1] !== "Products") return null;
        return parts.join("/");
    }

    function languageIdFromBackgroundPosition(pos) {
        const m = typeof pos === "string" && pos.match(/^\s*-(\d+)px/);
        if (!m) return null;
        const id = parseInt(m[1], 10) / 16;
        return Number.isInteger(id) && id > 0 ? id : null;
    }

    function languageCode(id, name) {
        if (id && LANGUAGE_CODES[id]) return LANGUAGE_CODES[id];
        if (id) return "lang-" + id;
        return "unknown";
    }

    function languageFilterFromSearch(search) {
        const value = new URLSearchParams(search).get("language");
        if (!value) return null;
        return value.split(",").filter(Boolean).map((id) => languageCode(Number(id), ""));
    }

    function hasOtherFilters(search) {
        for (const key of new URLSearchParams(search).keys()) if (key !== "language") return true;
        return false;
    }

    function mergeLanguages(a, b) {
        if (a === null || b === null) return null;
        return [...new Set([...a, ...b])];
    }

    function mergeScan(record, scan) {
        const rec = record ? JSON.parse(JSON.stringify(record)) : { name: scan.name, scans: [], listings: {} };
        rec.name = scan.name || rec.name;

        const existing = rec.scans.find((s) => s[0] === scan.today);
        if (existing) {
            existing[1] = mergeLanguages(existing[1], scan.languages);
            existing[2] = existing[2] && scan.otherFilters;
        } else {
            rec.scans.push([scan.today, scan.languages, scan.otherFilters]);
            rec.scans.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        }

        for (const l of scan.listings) {
            if (l.price === null || l.price === undefined) continue;
            const g = l.grade || {};
            const cur = rec.listings[l.id] || (rec.listings[l.id] = { points: [] });
            cur.grader = g.grader;
            cur.grade = g.grade;
            cur.gradeText = g.gradeText;
            cur.language = l.language;
            cur.lastSeen = scan.today;
            const last = cur.points[cur.points.length - 1];
            if (last && last[0] === scan.today) last[1] = l.price;
            else if (!last || last[1] !== l.price) cur.points.push([scan.today, l.price]);
        }
        return rec;
    }

    const api = { LANGUAGE_CODES, productKeyFromUrl, languageIdFromBackgroundPosition, languageCode, languageFilterFromSearch, hasOtherFilters, mergeScan };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
