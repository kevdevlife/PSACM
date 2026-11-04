# Graded Price History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently record graded listings seen on Cardmarket product pages, show "last seen" prices in the graded grid, a 30-day graded graph in Cardmarket's graph position, and Export/Import in the popup.

**Architecture:** A new pure UMD module `lib/history.js` holds all data logic (keys, language codes, merging scans, last-seen, daily series, import/export) and is unit-tested with `node --test`. `content.js` records each product-page scan into `chrome.storage.local` under `hist:<productKey>` and feeds history into the existing grid. A new content script `graded-chart.js` draws an SVG chart behind a "Cardmarket avg | Graded" switch above Cardmarket's Chart.js graphs. `popup.js` gets a small Price history section.

**Tech Stack:** Chrome MV3, plain JS, no build step, no new dependencies. Tests: `npm test` (`node --test "tests/**/*.test.js"`).

**Spec:** `docs/superpowers/specs/2026-11-04-graded-price-history-design.md`

## Global Constraints

- Additive UI only: never move, re-parent, restyle or change data/options of Cardmarket's nodes or Chart.js instances. Sole exception: hide Cardmarket's chart canvas while "Graded" is selected, restore it exactly on "Cardmarket avg".
- Storage: `chrome.storage.local`, one key per product `hist:<productKey>`; add `"unlimitedStorage"` to `manifest.json` permissions.
- Record only on product pages (`isProductPage()`), all graders (ignore the popup's enabled-graders filter), skip `price === null`.
- Dates are local calendar dates `YYYY-MM-DD`.
- Languages are stored as canonical codes, never Cardmarket's localized names.
- Graph window: last 30 days ending today.
- Prices displayed in the page's format, e.g. `145,00 €` (same as `priceText`).
- Lib modules follow the existing UMD pattern (`(function (root) { … })(globalThis)`, `module.exports` in Node, `Object.assign(root, api)` in the browser).
- The working tree has the owner's own uncommitted work in `content.js`, `manifest.json` and untracked files (`country-select.js`, `filter-sidebar.js`, `lib/country-search.js`, `lib/filter-state.js` and their tests). Do not revert, reformat or commit it as part of these tasks; stage only this plan's hunks (`git add -p`) or ask the owner to commit their work first.

**Verified on the live site (2026-11-04):**
- Language flag: `.product-attributes span.icon` with inline `background-position: -<16·id>px 0px` on sprite `ssMain2.png` (English `-16px` = id 1, French `-32px` = 2, German `-48px` = 3, Spanish `-64px` = 4, Italian `-80px` = 5). The tooltip text is localized ("Englisch" on /de/), so don't use it as the key.
- Language filter: URL `?language=1,7` (comma-separated ids); form inputs `#articleFilters input[name="language[<id>]"]`.
- Charts: Chart.js 2.7.2, canvases `.chartjs-render-monitor` inside `.chart-container` in `#tabContent-info`, `#tabContent-chart`, `#tabContent-sell`.

## Review Focus

1. **Other server-side filters make listings look "gone".** A scan with a condition/seller-country/etc. filter in the URL hides graded listings that still exist. Expected: such a scan never ends a line. Scans store an `otherFilters` flag; only scans without it count as "covering". Test in Task 2.
2. **First visit with a language filter, later visit without (and vice versa).** Expected: a scan filtered to `en` never marks a `ja` listing gone. Test in Task 2.
3. **Corrupt or foreign JSON on import.** Expected: an error message, existing history untouched. Test in Task 3.
4. **Unknown language sprite / missing flag.** Expected: the listing is still recorded under a fallback code (`lang-<id>` or `unknown`), nothing throws. Test in Task 1.
5. **Re-scan from the popup on the same page.** Expected: no duplicate switch/chart/grid. The day's scan entry and points are replaced, not appended. Tests in Task 1, manual check in Tasks 5–6.

---

### Task 1: `lib/history.js` — keys, languages, recording

**Files:**
- Create: `lib/history.js`
- Test: `tests/history.test.js`

**Interfaces:**
- Produces:
  - `LANGUAGE_CODES`: `{1:"en",2:"fr",3:"de",4:"es",5:"it",6:"zh-cn",7:"ja",8:"pt",9:"ru",10:"ko",11:"zh-tw",12:"nl"}`
  - `productKeyFromUrl(url: string) -> string|null`: path after the locale segment, no query/hash; `null` if not a `/Products/` URL.
  - `languageIdFromBackgroundPosition(pos: string) -> number|null`: `"-16px 0px"` → `1`.
  - `languageCode(id: number|null, name: string) -> string`: `LANGUAGE_CODES[id]`, else `"lang-"+id` if id, else `"unknown"`.
  - `languageFilterFromSearch(search: string) -> string[]|null`: from `?language=1,7` → `["en","ja"]`; no param → `null`.
  - `hasOtherFilters(search: string) -> boolean`: true if any query param other than `language` is present.
  - `mergeScan(record: object|null, scan: {today, name, languages: string[]|null, otherFilters: boolean, listings: Array<{id, price, language, grade:{grader, grade, gradeText}}>}) -> record` (returns a new object; input not mutated).
  - Record shape: `{ name, scans: [[date, languages|null, otherFilters]], listings: { [id]: { grader, grade, gradeText, language, points: [[date, price]], lastSeen } } }`.

- [ ] **Step 1: Write the failing tests** in `tests/history.test.js`:

```js
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
```

(Same-day scans merge: languages union, `null` wins over a set, `otherFilters` is true only if every scan that day had other filters.)

- [ ] **Step 2: Run** `npm test` — Expected: FAIL, `Cannot find module '../lib/history.js'`.
- [ ] **Step 3: Implement** `lib/history.js` with the interfaces above (UMD pattern as `lib/prices.js`).
- [ ] **Step 4: Run** `npm test` — Expected: all tests PASS.
- [ ] **Step 5: Commit** `git add lib/history.js tests/history.test.js && git commit -m "feat: history module with scan recording"`

---

### Task 2: `lib/history.js` — last seen and daily series

**Files:**
- Modify: `lib/history.js`
- Test: `tests/history.test.js`

**Interfaces:**
- Consumes: record shape from Task 1.
- Produces:
  - `lastSeenByGrade(record, languages: string[]|null) -> Map<gradeText, {grader, grade, gradeText, price, date, language}>`: among the listings of that grade (in `languages`, or all if `null`), those with the most recent `lastSeen`; among those, the lowest latest-point price. `date` = that `lastSeen`.
  - `isCovering(scanEntry, language) -> boolean`: `!otherFilters && (languages === null || languages.includes(language))`.
  - `dailySeries(record, {language: string, endDate: string, days: number}) -> Array<{gradeText, grader, grade, days: Array<{date, price: number|null, seen: boolean}>}>`: graders in `GRADING_PATTERNS` order, grades high → low; only grades with at least one non-null day.
  - `languagesInRecord(record) -> Array<{language, count}>`: count = number of listings in that language, sorted by count desc.

Daily series rule (spec §3): a listing is on sale on day `d` at the price of its latest point with date ≤ `d`, when `d` ≥ first point date and either `d` ≤ `lastSeen`, or no covering scan exists with date in (`lastSeen`, `d`]. Day value = min over on-sale listings of the grade, else `null`. `seen` = a covering scan exists on `d` and the day value isn't `null`.

- [ ] **Step 1: Write the failing tests:**

```js
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
```

- [ ] **Step 2: Run** `npm test` — Expected: the new tests FAIL with `H.lastSeenByGrade is not a function`.
- [ ] **Step 3: Implement** the four functions in `lib/history.js`. Grader order comes from `GRADING_PATTERNS` (`require("./grading.js")` in Node, `root.GRADING_PATTERNS` in the browser, like `lib/prices.js` does).
- [ ] **Step 4: Run** `npm test` — Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: history last-seen and daily series"` (only these two files).

---

### Task 3: `lib/history.js` — import/export merge, price format

**Files:**
- Modify: `lib/history.js`, `lib/prices.js`
- Test: `tests/history.test.js`, `tests/prices.test.js`

**Interfaces:**
- Produces:
  - `mergeRecords(a, b) -> record`: listings union; per listing, points union by date (on the same date `b` wins), `lastSeen` = the later one, grade/language from the side with the later `lastSeen`; scans union by date using the same-day rule from Task 1; `name` from `b` if present.
  - `buildExport(products: {[key]: record}, now: Date) -> {version: 1, exportedAt: ISO string, products}`.
  - `parseImport(text: string) -> {[key]: record}`: throws `Error("Not a graded history file")` if JSON is invalid, `version !== 1`, or `products` isn't an object of records with a `listings` object.
  - `historyStats(products) -> {cards, listings}`.
  - In `lib/prices.js`: `formatPrice(n: number) -> string`: `145` → `"145,00 €"`, `19443` → `"19.443,00 €"`.

- [ ] **Step 1: Write the failing tests:**

```js
test("mergeRecords unions points and keeps the later lastSeen", () => {
    const a = H.mergeScan(null, scan("2026-10-01", [L("a1", 150)]));
    const b = H.mergeScan(null, scan("2026-10-09", [L("a1", 120), L("a3", 200)]));
    const m = H.mergeRecords(a, b);
    assert.deepEqual(m.listings.a1.points, [["2026-10-01", 150], ["2026-10-09", 120]]);
    assert.equal(m.listings.a1.lastSeen, "2026-10-09");
    assert.ok(m.listings.a3);
    assert.equal(m.scans.length, 2);
});

test("parseImport rejects bad files (Review Focus 3)", () => {
    assert.throws(() => H.parseImport("not json"), /Not a graded history file/);
    assert.throws(() => H.parseImport('{"version":2,"products":{}}'), /Not a graded history file/);
    assert.throws(() => H.parseImport('{"version":1,"products":{"k":{"x":1}}}'), /Not a graded history file/);
    const exp = H.buildExport({ k: H.mergeScan(null, scan("2026-10-01", [L("a1", 1)])) }, new Date("2026-11-04T10:00:00Z"));
    assert.deepEqual(H.parseImport(JSON.stringify(exp)), exp.products);
    assert.deepEqual(H.historyStats(exp.products), { cards: 1, listings: 1 });
});
```

In `tests/prices.test.js`:

```js
test("formatPrice", () => {
    assert.equal(formatPrice(145), "145,00 €");
    assert.equal(formatPrice(19443), "19.443,00 €");
});
```

- [ ] **Step 2: Run** `npm test` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the functions; export `formatPrice` from `lib/prices.js`.
- [ ] **Step 4: Run** `npm test` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat: history import/export merge and price format`

---

### Task 4: Record scans on product pages

**Files:**
- Modify: `manifest.json` (add `"unlimitedStorage"`; add `lib/history.js` after `lib/prices.js` in the first content-script `js` list)
- Modify: `content.js` (`readListing`, `runScan`, new `recordHistory`)

**Interfaces:**
- Consumes: `productKeyFromUrl`, `languageIdFromBackgroundPosition`, `languageCode`, `languageFilterFromSearch`, `hasOtherFilters`, `mergeScan`.
- Produces:
  - `readListing` result gains `languageCode: string` (from the flag icon's `style.backgroundPosition` via `languageIdFromBackgroundPosition` + `languageCode(id, language)`). `language` stays as is.
  - `async function recordHistory(listings) -> record|null` in `content.js`: on product pages only; reads `hist:<key>`, calls `mergeScan` with `today` (local `YYYY-MM-DD`), `name` from `document.title` minus the ` | Cardmarket` suffix, `languages` from `languageFilterFromSearch(location.search)`, `otherFilters` from `hasOtherFilters(location.search)`, and graded listings mapped to `{id, price, language: languageCode, grade}`; writes it back once; returns the merged record.
  - Module-level `let currentHistory = null;` set by `runScan`, which Tasks 5–6 read.

- [ ] **Step 1:** In `runScan`, when `productPage`, call `currentHistory = await recordHistory(currentListings)` inside its own try/catch (log `[Grading Scanner] history failed:`), before `injectPageHighlights`. Recording uses `currentListings` filtered on `l.grade`, not the enabled-graders `hits`.
- [ ] **Step 2:** Run `npm test` — Expected: all PASS (no regressions).
- [ ] **Step 3: Manual verify:** reload the unpacked extension and open `https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Charizard-V1-BS4`. In the extension's service-worker devtools run `chrome.storage.local.get(null, console.log)`. Expected: a `hist:Pokemon/Products/Singles/Base-Set/Charizard-V1-BS4` key whose listings have language `en`/`de`/…, not "English". Reload the page: still one scan entry for today. Open the same card on `/de/`: same key, still `en` codes.
- [ ] **Step 4: Commit** only this task's hunks: `feat: record graded sightings per product`

---

### Task 5: Last seen in the graded grid

**Files:**
- Modify: `lib/history.js` (new pure helper), `content.js` (`renderOverview` graded part)
- Test: `tests/history.test.js`

**Interfaces:**
- Consumes: `buildOverview(...).graded` (`[{gradeText, grader, grade, color, priceText}]`), `lastSeenByGrade`, `formatPrice`, `currentHistory`.
- Produces: `gridCells(liveGraded, lastSeen: Map, opts: {showLanguage: boolean}) -> Array<{gradeText, grader, grade, color, priceText, faded: boolean, title: string|null}>`: live entries unchanged with `faded: false`. Each history grade without a live entry becomes `faded: true` with `priceText` = `formatPrice(price) + " · " + (showLanguage ? LANG.toUpperCase() + " · " : "") + shortDate` (e.g. `145,00 € · JA · 12 Oct`) and `title` = `Last seen 12 Oct 2026 (JA)`. Sorted like `buildOverview` (grader order, grade desc). `color` from `GRADING_PATTERNS`. Short dates use `en-GB` day + short month.

- [ ] **Step 1: Write the failing test:**

```js
test("gridCells adds faded history cells for grades without a live listing", () => {
    const live = [{ gradeText: "PSA 10", grader: "PSA", grade: "10", color: "#d9534f", priceText: "400,00 €" }];
    const cells = H.gridCells(live, H.lastSeenByGrade(rec(), ["en"]), { showLanguage: false });
    assert.deepEqual(cells.map(c => [c.gradeText, c.faded]), [["PSA 10", false], ["PSA 9", true]]);
    assert.equal(cells[1].priceText, "140,00 € · 20 Oct");
    const multi = H.gridCells([], H.lastSeenByGrade(rec(), null), { showLanguage: true });
    assert.equal(multi.find(c => c.gradeText === "PSA 9").priceText, "95,00 € · JA · 20 Oct");
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `gridCells`. In `renderOverview`, build the grid from `gridCells(graded, lastSeenByGrade(currentHistory, langFilter), { showLanguage: langFilter === null || langFilter.length > 1 })`, where `langFilter = languageFilterFromSearch(location.search)`. Show the box when there are live *or* history cells. Faded cells: `opacity: 0.55`, `font-style: italic`, `title` attribute. The `–` empty cells and the rest of the grid stay as today.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Manual verify:** on a card with a PSA listing in English, add `?language=7` (or another language without that grade). Expected: that grade's cell shows faded with price and date. Popup "Scan Page" twice: still one grid.
- [ ] **Step 6: Commit** `feat: last seen prices in graded grid`

---

### Task 6: Graded graph behind a switch

**Files:**
- Create: `graded-chart.js` (content script, DOM only)
- Modify: `manifest.json` (add `graded-chart.js` after `content.js`), `content.js` (call it at the end of `runScan` on product pages)

**Interfaces:**
- Consumes: `dailySeries`, `languagesInRecord`, `lastSeenByGrade`, `formatPrice`, `GRADING_PATTERNS`, `languageFilterFromSearch`, `currentHistory`.
- Produces: global `function injectGradedChart(record) -> void`. Idempotent: removes earlier `.gs-chart-switch` / `.gs-graded-chart` nodes and restores Cardmarket's canvases before re-injecting. No-op if `record` has no listings.

Behaviour (spec §3):
- For each `.chart-container` that holds a `canvas.chartjs-render-monitor`, insert a Bootstrap `btn-group btn-group-sm` (`.gs-chart-switch`) right before the container with buttons **Cardmarket avg** and **Graded**. Mode is stored in `chrome.storage.local.chartMode` (`"cm"` default | `"graded"`) and applies to all containers at once.
- Graded: set their canvas `style.display = "none"` and append our `.gs-graded-chart` div into that container. Cardmarket avg: remove ours and clear the `display` we set. Never touch anything else.
- Our div holds: a header row with a language `<select>` (options from `languagesInRecord`; default = first of the page language filter if present in the record, else the most common), an inline SVG with `viewBox` sized to the container (fallback 450×250 for hidden tabs) and `width: 100%`, and a legend grid.
- Lines: for each series, a step path (horizontal then vertical) across non-null days. `null` breaks the path. A dot (r=2.5) on `seen` days. Stroke 2px. Colour = grader colour, shaded per grade: the highest grade at full colour, each lower grade mixed 20% further toward the page background (cap at 60%).
- Axes: y with 4 gridlines from 0 to a rounded max of the visible series; x labels every 5th day as `dd.mm.`. Text uses `currentColor` and `var(--bs-secondary-color)`, gridlines `var(--bs-border-color)`, so both site themes work.
- Legend: CSS grid, one column per grader, rows by grade high → low. Each entry is a button with a colour swatch and `PSA 10 (19.443,00 €)`, using the series' last non-null day, or the faded `lastSeenByGrade` text if it's gone. Click toggles the line. Hidden = `text-decoration: line-through; opacity: .6`. Initially visible: the highest grade per grader.
- Hover: an SVG overlay rect maps the mouse x to the nearest day and shows a small absolutely positioned tooltip (`date · gradeText · price` for visible lines with a value).
- Empty state: if no visible series has any value, show muted text `No graded sightings yet for this language` instead of the SVG.

- [ ] **Step 1:** Implement `graded-chart.js` and call `injectGradedChart(currentHistory)` in `runScan` (product pages, in its own try/catch).
- [ ] **Step 2:** Run `npm test` — Expected: all PASS.
- [ ] **Step 3: Manual verify** (Charizard Base Set, plus a card where you've built a few days of data by editing `hist:` points in devtools):
  - The switch shows above the graph in the Info, Chart and Sell tabs.
  - Graded hides their canvas. Switching back restores it, and hover tooltips still work on their graph.
  - The choice is remembered after a reload.
  - Language picker, legend toggles, struck-through entries, dots and the line ending after a "gone" scan all work.
  - Checked in both Cardmarket's light and dark themes.
  - A popup re-scan doesn't duplicate anything.
- [ ] **Step 4: Commit** `feat: graded price graph behind Cardmarket avg | Graded switch`

---

### Task 7: Popup Export / Import

**Files:**
- Modify: `popup.html` (a "Price history" block under the Scan/Favorites buttons: a count line `#histCount`, buttons `#histExport`, `#histImport`, hidden `<input type="file" id="histFile" accept=".json,application/json">`, a message line `#histMsg`; reuse the existing `.btn btn-secondary` styles), `popup.js`; load `lib/grading.js` and `lib/history.js` via `<script>` in `popup.html` before `popup.js`.

**Interfaces:**
- Consumes: `buildExport`, `parseImport`, `mergeRecords`, `historyStats`.

Behaviour:
- Count: read every `hist:` key and show `History: N cards, M listings` (via `historyStats`). Refresh after an import.
- Export: download `cardmarket-graded-history-YYYY-MM-DD.json` via a Blob URL on an `<a download>` click.
- Import: read the file and run `parseImport`. On error, show `#histMsg` = the error message and change nothing. Otherwise `mergeRecords(existing, imported)` per key, write all keys in one `chrome.storage.local.set`, and show `Imported N cards`.
- If the popup closes when the file dialog opens, change `#histImport` to open `chrome.runtime.getURL("popup.html#import")` in a new tab and run the file picker there. Check this during manual verify.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npm test` — Expected: all PASS.
- [ ] **Step 3: Manual verify:**
  - Export downloads a file and the count matches.
  - Delete one `hist:` key in devtools, import the file, and check it's back while other keys are untouched.
  - Importing a `.json` file that isn't a history file shows `Not a graded history file`.
- [ ] **Step 4: Commit** `feat: export and import graded price history`
