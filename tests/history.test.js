const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../lib/history.js");

const PSA9 = { grader: "PSA", grade: "9", gradeText: "PSA 9" };
const scan = (today, listings, extra = {}) => ({ today, name: "Charizard", languages: null, otherFilters: false, listings, ...extra });
const L = (id, price, language = "en", grade = PSA9) => ({ id, price, language, grade });

test("productKeyFromUrl strips locale, query and hash", () => {
    const k = "Pokemon/Products/Singles/Base-Set/Charizard-V1-BS4";
    assert.equal(H.productKeyFromUrl("https://www.cardmarket.com/en/" + k + "?language=1#articleRow5"), k);
    assert.equal(H.productKeyFromUrl("https://www.cardmarket.com/de/" + k), k);
    assert.equal(H.productKeyFromUrl("https://www.cardmarket.com/en/Pokemon/Users/Foo"), null);
});

test("language helpers", () => {
    assert.equal(H.languageIdFromBackgroundPosition("-16px 0px"), 1);
    assert.equal(H.languageIdFromBackgroundPosition("-80px -0px"), 5);
    assert.equal(H.languageIdFromBackgroundPosition(""), null);
    assert.equal(H.languageCode(7, "Japanisch"), "ja");
    assert.equal(H.languageCode(42, "Klingon"), "lang-42");
    assert.equal(H.languageCode(null, ""), "unknown");
    assert.deepEqual(H.languageFilterFromSearch("?language=1,7"), ["en", "ja"]);
    assert.equal(H.languageFilterFromSearch("?minCondition=2"), null);
    assert.equal(H.hasOtherFilters("?language=1"), false);
    assert.equal(H.hasOtherFilters("?language=1&minCondition=2"), true);
});

test("mergeScan: first sighting, same day re-scan, new day same price, price change", () => {
    let r = H.mergeScan(null, scan("2026-11-04", [L("a1", 145)]));
    assert.deepEqual(r.listings.a1.points, [["2026-11-04", 145]]);
    assert.deepEqual(r.scans, [["2026-11-04", null, false]]);
    r = H.mergeScan(r, scan("2026-11-04", [L("a1", 140)]));          // same day, new price replaces
    assert.deepEqual(r.listings.a1.points, [["2026-11-04", 140]]);
    assert.equal(r.scans.length, 1);
    r = H.mergeScan(r, scan("2026-11-10", [L("a1", 140)]));          // new day, same price
    assert.deepEqual(r.listings.a1.points, [["2026-11-04", 140]]);
    assert.equal(r.listings.a1.lastSeen, "2026-11-10");
    r = H.mergeScan(r, scan("2026-11-20", [L("a1", 139)]));          // price change appends
    assert.deepEqual(r.listings.a1.points, [["2026-11-04", 140], ["2026-11-20", 139]]);
});

test("mergeScan: same-day scans merge their language sets; skips null prices; latest grade wins; input not mutated", () => {
    const r0 = H.mergeScan(null, scan("2026-11-04", [L("a1", 145)], { languages: ["en"] }));
    const before = JSON.stringify(r0);
    const r = H.mergeScan(r0, scan("2026-11-04", [L("a2", null), L("a1", 145, "en", { grader: "PSA", grade: "10", gradeText: "PSA 10" })], { languages: ["ja"] }));
    assert.equal(JSON.stringify(r0), before);
    assert.deepEqual(r.scans, [["2026-11-04", ["en", "ja"], false]]);
    assert.equal(r.listings.a2, undefined);
    assert.equal(r.listings.a1.gradeText, "PSA 10");
});

const rec = () => {
    let r = H.mergeScan(null, scan("2026-10-01", [L("a1", 150), L("a2", 400, "en", { grader: "PSA", grade: "10", gradeText: "PSA 10" }), L("j1", 90, "ja")]));
    r = H.mergeScan(r, scan("2026-10-20", [L("a1", 140), L("j1", 95, "ja")]));
    return r;
};

test("lastSeenByGrade per language set", () => {
    const all = H.lastSeenByGrade(rec(), null);
    assert.equal(all.get("PSA 9").price, 95);        // j1 and a1 both last seen 10-20; lowest wins
    assert.equal(all.get("PSA 9").language, "ja");
    assert.equal(H.lastSeenByGrade(rec(), ["en"]).get("PSA 9").price, 140);
    assert.equal(H.lastSeenByGrade(rec(), ["en"]).get("PSA 10").date, "2026-10-01");
});

test("dailySeries: carry-forward, gone after covering scan, dots on scan days", () => {
    const s = H.dailySeries(rec(), { language: "en", endDate: "2026-10-30", days: 30 });
    const psa9 = s.find(x => x.gradeText === "PSA 9").days;
    const psa10 = s.find(x => x.gradeText === "PSA 10").days;
    const day = (arr, d) => arr.find(x => x.date === d);
    assert.equal(psa9.length, 30);
    assert.deepEqual(day(psa9, "2026-10-01"), { date: "2026-10-01", price: 150, seen: true });
    assert.deepEqual(day(psa9, "2026-10-10"), { date: "2026-10-10", price: 150, seen: false });
    assert.equal(day(psa9, "2026-10-20").price, 140);
    assert.equal(day(psa9, "2026-10-30").price, 140);   // not checked since: carried forward
    assert.equal(day(psa10, "2026-10-19").price, 400);
    assert.equal(day(psa10, "2026-10-20").price, null); // covering scan didn't see it: gone
});

test("dailySeries: filtered scans don't end lines (Review Focus 1, 2)", () => {
    let r = H.mergeScan(null, scan("2026-10-01", [L("a1", 150), L("j1", 90, "ja")]));
    r = H.mergeScan(r, scan("2026-10-05", [], { otherFilters: true }));
    r = H.mergeScan(r, scan("2026-10-06", [L("a1", 150)], { languages: ["en"] }));
    assert.equal(H.dailySeries(r, { language: "en", endDate: "2026-10-05", days: 1 })[0].days[0].price, 150);
    assert.equal(H.dailySeries(r, { language: "ja", endDate: "2026-10-07", days: 1 })[0].days[0].price, 90);
});

test("dailySeries: window starts at a value seen before the window", () => {
    const s = H.dailySeries(rec(), { language: "en", endDate: "2026-12-01", days: 30 });
    assert.equal(s.find(x => x.gradeText === "PSA 9").days[0].price, 140);
});

test("languagesInRecord sorted by count", () => {
    assert.deepEqual(H.languagesInRecord(rec()), [{ language: "en", count: 2 }, { language: "ja", count: 1 }]);
});

test("mergeRecords unions points and keeps the later lastSeen", () => {
    const a = H.mergeScan(null, scan("2026-10-01", [L("a1", 150)]));
    const b = H.mergeScan(null, scan("2026-10-09", [L("a1", 120), L("a3", 200)]));
    const m = H.mergeRecords(a, b);
    assert.deepEqual(m.listings.a1.points, [["2026-10-01", 150], ["2026-10-09", 120]]);
    assert.equal(m.listings.a1.lastSeen, "2026-10-09");
    assert.ok(m.listings.a3);
    assert.equal(m.scans.length, 2);
});

test("mergeRecords: null side, no mutation, b wins same date", () => {
    const b = H.mergeScan(null, scan("2026-10-09", [L("a1", 120)]));
    const copy = JSON.parse(JSON.stringify(b));
    const m = H.mergeRecords(null, b);
    assert.deepEqual(m, b);
    m.listings.a1.points.push(["x", 1]);
    assert.deepEqual(b, copy);
    const a = H.mergeScan(null, scan("2026-10-09", [L("a1", 100)]));
    assert.deepEqual(H.mergeRecords(a, b).listings.a1.points, [["2026-10-09", 120]]);
});

test("parseImport rejects bad files (Review Focus 3)", () => {
    assert.throws(() => H.parseImport("not json"), /Not a graded history file/);
    assert.throws(() => H.parseImport('{"version":2,"products":{}}'), /Not a graded history file/);
    assert.throws(() => H.parseImport('{"version":1,"products":{"k":{"x":1}}}'), /Not a graded history file/);
    const exp = H.buildExport({ k: H.mergeScan(null, scan("2026-10-01", [L("a1", 1)])) }, new Date("2026-11-04T10:00:00Z"));
    assert.deepEqual(H.parseImport(JSON.stringify(exp)), exp.products);
    assert.deepEqual(H.historyStats(exp.products), { cards: 1, listings: 1 });
});

test("parseImport validates records deeply", () => {
    const good = { name: "X", scans: [["2026-10-01", null, false]], listings: { a: { grader: "PSA", grade: "9", gradeText: "PSA 9", language: "en", lastSeen: "2026-10-01", points: [["2026-10-01", 5]] } } };
    const wrap = (r) => JSON.stringify({ version: 1, products: { k: r } });
    assert.doesNotThrow(() => H.parseImport(wrap(good)));
    const mut = (f) => { const r = JSON.parse(JSON.stringify(good)); f(r); return wrap(r); };
    const bad = [
        wrap({ listings: {} }),
        mut((r) => { delete r.listings.a.points; }),
        mut((r) => { r.listings.a = null; }),
        mut((r) => { r.listings.a.points = [["2026-10-01", "5"]]; }),
        mut((r) => { r.scans = [["x", null, false]]; }),
        mut((r) => { r.scans = [["2026-10-01", [1], false]]; })
    ];
    for (const t of bad) assert.throws(() => H.parseImport(t), /Not a graded history file/);
});

test("mergeRecords normalizes unsorted/duplicate points", () => {
    const b = { name: "X", scans: [], listings: { a: { grader: "PSA", grade: "9", gradeText: "PSA 9", language: "en", lastSeen: "2026-10-09", points: [["2026-10-09", 3], ["2026-10-01", 5], ["2026-10-09", 4]] } } };
    const want = [["2026-10-01", 5], ["2026-10-09", 4]];
    assert.deepEqual(H.mergeRecords(null, b).listings.a.points, want);
    assert.deepEqual(H.mergeRecords({ name: "X", scans: [], listings: {} }, b).listings.a.points, want);
});

test("gridCells adds faded history cells for grades without a live listing", () => {
    const live = [{ gradeText: "PSA 10", grader: "PSA", grade: "10", color: "#d9534f", priceText: "400,00 €" }];
    const cells = H.gridCells(live, H.lastSeenByGrade(rec(), ["en"]), { showLanguage: false });
    assert.deepEqual(cells.map(c => [c.gradeText, c.faded]), [["PSA 10", false], ["PSA 9", true]]);
    assert.equal(cells[1].priceText, "140,00 € · 20 Oct");
    const multi = H.gridCells([], H.lastSeenByGrade(rec(), null), { showLanguage: true });
    assert.equal(multi.find(c => c.gradeText === "PSA 9").priceText, "95,00 € · JA · 20 Oct");
});
