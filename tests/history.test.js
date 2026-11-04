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
