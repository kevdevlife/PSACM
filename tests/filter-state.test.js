const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SCALES, neutralValue, scaleSummary, scaleCaption, checkedSummary, isIncluded,
} = require("../lib/filter-state.js");

test("neutral value: known scales use their least strict option", () => {
    assert.equal(neutralValue("minCondition", ["1", "2", "7"]), "7");
    assert.equal(neutralValue("sellerReputation", ["1", "5"]), "5");
    assert.equal(neutralValue("maxShippingTime", ["2", "7"]), "7");
});

test("neutral value: unknown selects prefer '0', else the last option", () => {
    assert.equal(neutralValue("extra[isSigned]", ["0", "Y", "N"]), "0");
    assert.equal(neutralValue("somethingNew", ["a", "b", "c"]), "c");
    assert.equal(neutralValue("somethingNew", ["x", "0"]), "0");
});

test("scale summary is null at neutral", () => {
    assert.equal(scaleSummary("minCondition", "7"), null);
    assert.equal(scaleSummary("sellerReputation", "5"), null);
    assert.equal(scaleSummary("maxShippingTime", "7"), null);
    assert.equal(scaleSummary("extra[isSigned]", "0"), null);
});

test("scale summaries read as short chips", () => {
    assert.equal(scaleSummary("minCondition", "2"), "NM+");
    assert.equal(scaleSummary("minCondition", "1"), "MT");
    assert.equal(scaleSummary("sellerReputation", "3"), "Good+ sellers");
    assert.equal(scaleSummary("sellerReputation", "1"), "Outstanding sellers");
    assert.equal(scaleSummary("maxShippingTime", "4"), "≤ 4 days delivery");
    assert.equal(scaleSummary("extra[isSigned]", "Y"), "Signed");
    assert.equal(scaleSummary("extra[isAltered]", "N"), "Not altered");
});

test("unknown field or value yields null summary", () => {
    assert.equal(scaleSummary("nope", "1"), null);
    assert.equal(scaleSummary("minCondition", "99"), null);
});

test("captions spell out the meaning", () => {
    assert.equal(scaleCaption("minCondition", "7"), "Any condition");
    assert.equal(scaleCaption("minCondition", "2"), "Near Mint or better");
    assert.equal(scaleCaption("minCondition", "1"), "Mint only");
    assert.equal(scaleCaption("sellerReputation", "5"), "Any reputation");
    assert.equal(scaleCaption("sellerReputation", "4"), "Average or better");
    assert.equal(scaleCaption("sellerReputation", "1"), "Outstanding only");
    assert.equal(scaleCaption("maxShippingTime", "7"), "Any delivery time");
    assert.equal(scaleCaption("maxShippingTime", "3"), "3 days or faster on average");
});

test("isIncluded marks the stricter end of a scale up to the chosen value", () => {
    // Condition 2 (NM) includes MT and NM, not EX
    assert.equal(isIncluded("minCondition", "1", "2"), true);
    assert.equal(isIncluded("minCondition", "2", "2"), true);
    assert.equal(isIncluded("minCondition", "3", "2"), false);
    // Neutral includes everything
    assert.equal(isIncluded("maxShippingTime", "6", "7"), true);
});

test("checked summary", () => {
    assert.equal(checkedSummary([], "languages"), null);
    assert.equal(checkedSummary(["English"], "languages"), "English");
    assert.equal(checkedSummary(["English", "French"], "languages"), "English, French");
    assert.equal(checkedSummary(["A", "B", "C"], "languages"), "3 languages");
});

test("every scale lists its options strict to loose with neutral last", () => {
    for (const [field, scale] of Object.entries(SCALES)) {
        const last = scale.options[scale.options.length - 1];
        assert.equal(last.value, scale.neutral, field);
    }
});
