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

// Element-like stand-ins: the helpers read the same properties as DOM fields.
const box = (name, defaultChecked, checked = defaultChecked) => ({ tagName: "INPUT", type: "checkbox", name, defaultChecked, checked });
const sel = (name, values, applied, value = applied) => ({
    tagName: "SELECT", name, value, options: values.map(v => ({ value: v, defaultSelected: v === applied })),
});
const num = (name, defaultValue, value = defaultValue) => ({ tagName: "INPUT", type: "number", name, defaultValue, value });

test("appliedValue reads the page-load state, not unsubmitted edits", () => {
    const { appliedValue } = require("../lib/filter-state.js");
    assert.equal(appliedValue(box("language[1]", true, false)), true);
    assert.equal(appliedValue(sel("minCondition", ["1", "2", "7"], "2", "7")), "2");
    assert.equal(appliedValue({ tagName: "SELECT", name: "x", options: [{ value: "a", defaultSelected: false }] }), "a");
    assert.equal(appliedValue(num("amount", "3", "0")), "3");
});

test("isNeutralFieldValue: unchecked boxes, neutral selects, empty/zero numbers", () => {
    const { isNeutralFieldValue } = require("../lib/filter-state.js");
    assert.equal(isNeutralFieldValue(box("sellerType[0]", false), false), true);
    assert.equal(isNeutralFieldValue(box("sellerType[0]", true), true), false);
    assert.equal(isNeutralFieldValue(sel("minCondition", ["1", "2", "7"], "7"), "7"), true);
    assert.equal(isNeutralFieldValue(sel("minCondition", ["1", "2", "7"], "2"), "2"), false);
    assert.equal(isNeutralFieldValue(sel("extra[isSigned]", ["0", "Y", "N"], "0"), "0"), true);
    assert.equal(isNeutralFieldValue(num("amount", ""), ""), true);
    assert.equal(isNeutralFieldValue(num("amount", "0"), "0"), true);
    assert.equal(isNeutralFieldValue(num("amount", "2"), "2"), false);
});

test("hasActiveFilters: any applied non-neutral field, optionally skipping some", () => {
    const { hasActiveFilters } = require("../lib/filter-state.js");
    const neutral = [box("sellerCountry[1]", false), sel("minCondition", ["1", "7"], "7"), num("amount", "")];
    assert.equal(hasActiveFilters(neutral), false);
    assert.equal(hasActiveFilters([...neutral, box("sellerCountry[2]", true)]), true);
    assert.equal(hasActiveFilters([...neutral, sel("minCondition", ["1", "7"], "1")]), true);
    assert.equal(hasActiveFilters([...neutral, box("sellerType[1]", false, true)]), false); // unsubmitted edit
    const isLanguage = f => f.name.startsWith("language[");
    assert.equal(hasActiveFilters([...neutral, box("language[1]", true)], isLanguage), false);
    assert.equal(hasActiveFilters([box("language[1]", true)]), true);
});
