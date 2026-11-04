const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePrice, buildOverview, formatPrice } = require("../lib/prices.js");

const g = (grader, grade, color = "#000") => ({ grader, grade, gradeText: grader + " " + grade, color });
const L = (conditionCode, price, grade = null) => ({
    conditionCode, grade, price,
    priceText: price === null ? "N/A" : price.toFixed(2).replace(".", ",") + " €"
});

test("parsePrice", () => {
    assert.equal(parsePrice("70,00 €"), 70);
    assert.equal(parsePrice("1.234,56 €"), 1234.56);
    assert.equal(parsePrice(""), null);
    assert.equal(parsePrice("N/A"), null);
});

test("raw lines: cheapest per condition, graded excluded, ordered", () => {
    const o = buildOverview([
        L("NM", 85), L("NM", 70), L("MT", 120), L("NM", 50, g("PSA", "10"))
    ]);
    assert.deepEqual(o.raw, [
        { code: "MT", priceText: "120,00 €" },
        { code: "NM", priceText: "70,00 €" }
    ]);
});

test("graded lines sorted by grader then grade desc", () => {
    const o = buildOverview([
        L("NM", 30, g("CGC", "10")), L("NM", 20, g("PSA", "9")), L("NM", 60, g("PSA", "10")),
        L("NM", 55, g("PSA", "10"))
    ]);
    assert.deepEqual(o.graded.map((x) => x.gradeText), ["PSA 10", "PSA 9", "CGC 10"]);
    assert.equal(o.graded[0].priceText, "55,00 €");
});

test("null price ignored; empty input", () => {
    const o = buildOverview([L("NM", null), L("EX", null, g("PSA", "8"))]);
    assert.deepEqual(o, { raw: [], graded: [] });
    assert.deepEqual(buildOverview([]), { raw: [], graded: [] });
});

test("formatPrice", () => {
    assert.equal(formatPrice(145), "145,00 €");
    assert.equal(formatPrice(19443), "19.443,00 €");
});
