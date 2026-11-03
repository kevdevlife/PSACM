const test = require("node:test");
const assert = require("node:assert/strict");
const { conditionOf, makeFavorite, isValidFavorite, escapeHtml, CONDITION_COLORS } = require("../lib/favorites.js");

const raw = { id: "articleRow1", url: "https://x/#articleRow1", cardName: "Pika", seller: "bob", conditionCode: "NM", language: "English", priceText: "1,00 €", price: 1, hasPhoto: true, grade: null, row: {} };
const graded = { ...raw, grade: { grader: "PSA", grade: "10", gradeText: "PSA 10", color: "#f00" } };

test("conditionOf raw", () => {
    assert.deepEqual(conditionOf(raw), { type: "raw", code: "NM" });
});

test("conditionOf graded", () => {
    assert.deepEqual(conditionOf(graded), { type: "graded", grader: "PSA", grade: "10", gradeText: "PSA 10", color: "#f00" });
});

test("makeFavorite copies only stored fields and sets savedAt", () => {
    const before = Date.now();
    const f = makeFavorite(graded);
    assert.deepEqual(Object.keys(f).sort(), ["cardName", "condition", "id", "language", "priceText", "savedAt", "seller", "url"]);
    assert.equal(f.id, "articleRow1");
    assert.equal(f.cardName, "Pika");
    assert.equal(f.condition.type, "graded");
    assert.ok(f.savedAt >= before);
});

test("isValidFavorite", () => {
    assert.equal(isValidFavorite(makeFavorite(raw)), true);
    assert.equal(isValidFavorite({ anchorName: "a", grader: "PSA", gradeText: "PSA 10", url: "u" }), false);
    assert.equal(isValidFavorite(null), false);
});

test("escapeHtml", () => {
    assert.equal(escapeHtml(`<b>&"'`), "&lt;b&gt;&amp;&quot;&#39;");
});

test("CONDITION_COLORS covers all codes with bg and fg", () => {
    for (const c of ["MT", "NM", "EX", "GD", "LP", "PL", "PO"]) {
        assert.ok(CONDITION_COLORS[c].bg && CONDITION_COLORS[c].fg);
    }
});
