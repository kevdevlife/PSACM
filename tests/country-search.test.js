const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, searchCountries } = require("../lib/country-search.js");

const list = ["Netherlands", "Austria", "Belgium", "Czech Republic", "Germany", "Réunion", "United Kingdom", "Australia"];

test("normalize lowercases and strips diacritics", () => {
    assert.equal(normalize("  Réunion "), "reunion");
});

test("empty query returns everything in original order", () => {
    assert.deepEqual(searchCountries(list, "").map(m => m.name), list);
    assert.deepEqual(searchCountries(list, "   ").map(m => m.name), list);
});

test("prefix matches rank before word matches before substring matches", () => {
    const names = searchCountries(["Czech Republic", "Ireland", "Reunion"], "re").map(m => m.name);
    assert.deepEqual(names, ["Reunion", "Czech Republic", "Ireland"]);
});

test("ties keep original order", () => {
    assert.deepEqual(searchCountries(list, "au").map(m => m.name), ["Austria", "Australia"]);
});

test("accent-insensitive in both directions", () => {
    assert.deepEqual(searchCountries(list, "reun").map(m => m.name), ["Réunion"]);
    assert.deepEqual(searchCountries(["Reunion"], "Réu").map(m => m.name), ["Reunion"]);
});

test("returns match range for highlighting", () => {
    const [m] = searchCountries(list, "king");
    assert.equal(m.name, "United Kingdom");
    assert.equal(m.name.slice(m.start, m.end), "King");
});

test("no match returns empty array", () => {
    assert.deepEqual(searchCountries(list, "xyz"), []);
});

test("carries the original index", () => {
    const [m] = searchCountries(list, "germ");
    assert.equal(m.index, 4);
});
