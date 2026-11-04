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

    function gradingPatterns() {
        return typeof module !== "undefined" && module.exports
            ? require("./grading.js").GRADING_PATTERNS
            : root.GRADING_PATTERNS;
    }

    function latestPrice(l) {
        return l.points[l.points.length - 1][1];
    }

    function lastSeenByGrade(record, languages) {
        const out = new Map();
        for (const l of Object.values(record.listings)) {
            if (languages && !languages.includes(l.language)) continue;
            const price = latestPrice(l);
            const cur = out.get(l.gradeText);
            if (!cur || l.lastSeen > cur.date || (l.lastSeen === cur.date && price < cur.price)) {
                out.set(l.gradeText, { grader: l.grader, grade: l.grade, gradeText: l.gradeText, price, date: l.lastSeen, language: l.language });
            }
        }
        return out;
    }

    function isCovering(scanEntry, language) {
        return !scanEntry[2] && (scanEntry[1] === null || scanEntry[1].includes(language));
    }

    function addDays(date, n) {
        const [y, m, d] = date.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    }

    function dailySeries(record, { language, endDate, days }) {
        const covering = record.scans.filter((s) => isCovering(s, language)).map((s) => s[0]);
        const dates = [];
        for (let i = days - 1; i >= 0; i--) dates.push(addDays(endDate, -i));

        const groups = new Map();
        for (const l of Object.values(record.listings)) {
            if (l.language !== language) continue;
            if (!groups.has(l.gradeText)) groups.set(l.gradeText, { gradeText: l.gradeText, grader: l.grader, grade: l.grade, listings: [] });
            groups.get(l.gradeText).listings.push(l);
        }

        const priceOn = (l, d) => {
            if (d < l.points[0][0]) return null;
            if (d > l.lastSeen && covering.some((c) => c > l.lastSeen && c <= d)) return null;
            let price = null;
            for (const p of l.points) { if (p[0] <= d) price = p[1]; else break; }
            return price;
        };

        const order = gradingPatterns().map((p) => p.name);
        const rank = (g) => { const i = order.indexOf(g); return i === -1 ? order.length : i; };
        const result = [];
        for (const g of groups.values()) {
            const series = dates.map((date) => {
                let price = null;
                for (const l of g.listings) {
                    const p = priceOn(l, date);
                    if (p !== null && (price === null || p < price)) price = p;
                }
                return { date, price, seen: price !== null && covering.includes(date) };
            });
            if (series.some((x) => x.price !== null)) result.push({ gradeText: g.gradeText, grader: g.grader, grade: g.grade, days: series });
        }
        result.sort((a, b) => rank(a.grader) - rank(b.grader) || (parseFloat(b.grade) || 0) - (parseFloat(a.grade) || 0));
        return result;
    }

    function languagesInRecord(record) {
        const counts = new Map();
        for (const l of Object.values(record.listings)) counts.set(l.language, (counts.get(l.language) || 0) + 1);
        return [...counts].map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count);
    }

    const api = { LANGUAGE_CODES, productKeyFromUrl, languageIdFromBackgroundPosition, languageCode, languageFilterFromSearch, hasOtherFilters, mergeScan, lastSeenByGrade, isCovering, dailySeries, languagesInRecord };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
