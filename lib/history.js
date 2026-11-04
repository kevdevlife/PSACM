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

    // Codes languageCode() falls back to when Cardmarket's id isn't mapped.
    function isUnmappedLanguage(code) {
        return code === "unknown" || /^lang-/.test(code);
    }

    function mergeLanguages(a, b) {
        if (a === null || b === null) return null;
        return [...new Set([...a, ...b])];
    }

    function addScanEntry(scans, date, languages, otherFilters) {
        const existing = scans.find((s) => s[0] === date);
        if (existing) {
            existing[1] = mergeLanguages(existing[1], languages);
            existing[2] = existing[2] && otherFilters;
        } else {
            scans.push([date, languages, otherFilters]);
            scans.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        }
    }

    function mergeScan(record, scan) {
        const rec = record ? JSON.parse(JSON.stringify(record)) : { name: scan.name, scans: [], listings: {} };
        rec.name = scan.name || rec.name;

        addScanEntry(rec.scans, scan.today, scan.languages, scan.otherFilters);

        for (const l of scan.listings) {
            if (l.price === null || l.price === undefined) continue;
            const g = l.grade || {};
            const cur = rec.listings[l.id] || (rec.listings[l.id] = { points: [] });
            cur.grader = g.grader;
            cur.grade = g.grade;
            cur.gradeText = g.gradeText;
            cur.language = l.language;
            // Unknown language: keep the raw (localized) name so nothing is lost.
            if (isUnmappedLanguage(l.language) && typeof l.languageName === "string" && l.languageName) cur.languageName = l.languageName;
            else delete cur.languageName;
            cur.lastSeen = scan.today;
            const last = cur.points[cur.points.length - 1];
            if (last && last[0] === scan.today) last[1] = l.price;
            else if (!last || last[1] !== l.price) cur.points.push([scan.today, l.price]);
        }
        return rec;
    }

    function mergeRecords(a, b) {
        const clone = (x) => JSON.parse(JSON.stringify(x));
        if (!b) return clone(a);
        const rec = a ? clone(a) : { name: b.name, scans: [], listings: {} };
        rec.name = b.name || rec.name;
        for (const s of clone(b.scans)) addScanEntry(rec.scans, s[0], s[1], s[2]);
        for (const [id, bl] of Object.entries(clone(b.listings))) {
            const al = rec.listings[id];
            const byDate = new Map(al ? al.points : []);
            for (const [d, p] of bl.points) byDate.set(d, p);
            const points = [...byDate].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
            if (!al) { rec.listings[id] = { ...bl, points }; continue; }
            const src = al.lastSeen > bl.lastSeen ? al : bl;
            rec.listings[id] = { grader: src.grader, grade: src.grade, gradeText: src.gradeText, language: src.language, points, lastSeen: src.lastSeen };
            if (typeof src.languageName === "string") rec.listings[id].languageName = src.languageName;
        }
        return rec;
    }

    function buildExport(products, now) {
        return { version: 1, exportedAt: now.toISOString(), products };
    }

    function parseImport(text) {
        const bad = () => new Error("Not a graded history file");
        let data;
        try { data = JSON.parse(text); } catch (e) { throw bad(); }
        if (!data || data.version !== 1) throw bad();
        const products = data.products;
        if (!products || typeof products !== "object" || Array.isArray(products)) throw bad();
        const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
        const isDate = (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
        const isStr = (x) => typeof x === "string";
        for (const r of Object.values(products)) {
            if (!isObj(r) || !isObj(r.listings) || !Array.isArray(r.scans)) throw bad();
            if (r.name !== undefined && !isStr(r.name)) throw bad();
            for (const s of r.scans) {
                if (!Array.isArray(s) || !isDate(s[0]) || typeof s[2] !== "boolean") throw bad();
                if (s[1] !== null && !(Array.isArray(s[1]) && s[1].every(isStr))) throw bad();
            }
            for (const l of Object.values(r.listings)) {
                if (!isObj(l) || !isStr(l.grader) || !isStr(l.grade) || !isStr(l.gradeText) || !isStr(l.language) || !isDate(l.lastSeen)) throw bad();
                if (l.languageName !== undefined && !isStr(l.languageName)) throw bad();
                if (!Array.isArray(l.points) || l.points.length === 0) throw bad();
                for (const p of l.points) if (!Array.isArray(p) || !isDate(p[0]) || typeof p[1] !== "number" || !Number.isFinite(p[1])) throw bad();
            }
        }
        return products;
    }

    function historyStats(products) {
        const records = Object.values(products);
        return { cards: records.length, listings: records.reduce((n, r) => n + Object.keys(r.listings).length, 0) };
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

    function formatPrice(n) {
        return (typeof module !== "undefined" && module.exports
            ? require("./prices.js").formatPrice
            : root.formatPrice)(n);
    }

    function formatDate(date, long) {
        const [y, m, d] = date.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB",
            long ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
    }

    function gridCells(liveGraded, lastSeen, opts) {
        const showLanguage = !!(opts && opts.showLanguage);
        const patterns = gradingPatterns();
        const cells = liveGraded.map((g) => ({ ...g, faded: false, title: null }));
        const liveKeys = new Set(liveGraded.map((g) => g.gradeText));
        for (const h of lastSeen.values()) {
            if (liveKeys.has(h.gradeText)) continue;
            const p = patterns.find((x) => x.name === h.grader);
            const lang = h.language.toUpperCase();
            cells.push({
                gradeText: h.gradeText, grader: h.grader, grade: h.grade, color: p ? p.color : undefined,
                priceText: formatPrice(h.price) + " · " + (showLanguage ? lang + " · " : "") + formatDate(h.date, false),
                faded: true,
                title: "Last seen " + formatDate(h.date, true) + " (" + lang + ")"
            });
        }
        const idx = (name) => { const i = patterns.findIndex((x) => x.name === name); return i < 0 ? patterns.length : i; };
        return cells.sort((a, b) => idx(a.grader) - idx(b.grader) || parseFloat(b.grade) - parseFloat(a.grade));
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
                // Dot = a listing of this grade was actually seen that day (by any scan).
                const seen = price !== null && g.listings.some((l) => l.lastSeen === date || l.points.some((p) => p[0] === date));
                return { date, price, seen };
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

    // Graded chart: [0, step, 2·step, 3·step] with a 1/2/2.5/5·10^n step covering max.
    function yAxisTicks(max) {
        const raw = max > 0 ? max / 3 : 1;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw - 1e-9);
        return [0, step, 2 * step, 3 * step];
    }

    function parseCssColor(css) {
        if (typeof css !== "string") return null;
        let m = css.match(/^#([0-9a-f]{6})$/i);
        if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
        m = css.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
        if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    // Grader colour per series; each lower grade of a grader mixes 20% further
    // toward the page background (capped at 60%). Series must be ordered grade desc per grader.
    function seriesColors(series, background) {
        const bg = parseCssColor(background) || [255, 255, 255];
        const patterns = gradingPatterns();
        const seen = new Map();
        const out = new Map();
        for (const s of series) {
            const i = seen.get(s.grader) || 0;
            seen.set(s.grader, i + 1);
            const p = patterns.find((x) => x.name === s.grader);
            const base = parseCssColor(p ? p.color : "") || [128, 128, 128];
            const t = Math.min(0.2 * i, 0.6);
            const c = base.map((v, k) => Math.round(v + (bg[k] - v) * t));
            out.set(s.gradeText, "rgb(" + c.join(", ") + ")");
        }
        return out;
    }

    const api = { LANGUAGE_CODES, productKeyFromUrl, languageIdFromBackgroundPosition, languageCode, languageFilterFromSearch, hasOtherFilters, mergeScan, mergeRecords, buildExport, parseImport, historyStats, lastSeenByGrade, gridCells, isCovering, dailySeries, languagesInRecord, formatDate, yAxisTicks, seriesColors };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
