# Cardmarket Grading Scanner — graded price history

Date: 2026-11-04
Extension: Chrome MV3, plain JS, no build step (`manifest.json`, `content.js`, `lib/*.js`, `popup.html`/`popup.js`, `background.js`). Tests: `node --test` on the `lib/` modules.

## Intent

The extension already finds the lowest price per grade on a product page (the "Graded · lowest price" grid, built by `buildOverview` in `lib/prices.js` and rendered by `renderOverview` in `content.js`). That knowledge disappears when the page closes.

The owner wants it to become permanent data. The concrete moment: you see a PSA 9 of a card once, then for months none is listed. You still want to see what it was last seen for. On top of that, a graded price graph in the spirit of Collectr's "Graded Price History", placed where Cardmarket shows its own price graph.

**Hard anti-goal (carried over):** no site restyling. A previous UI overhaul broke the site and was reverted. Everything is additive. The one exception, explicitly agreed: in Cardmarket's graph box, our switch may *hide* their graph canvas while ours is shown, and must restore it exactly when switched back. Never change their chart's data, options or Chart.js instance; never move or re-parent their nodes.

## Goals

1. Record every graded listing seen on a product page, permanently (survives restarts/updates), per language.
2. "Last seen" values in the existing graded grid for grades that have no live listing now.
3. A graded price graph (last 30 days) in Cardmarket's graph position, toggled with a "Cardmarket avg | Graded" switch.
4. Export / Import of the history from the popup, so data survives uninstall or moves to another PC.

## Non-goals

- No background crawling. Data only grows from product pages the owner actually opens (and popup re-scans of them).
- No server, account or sync between devices (Export/Import covers that).
- No raw (ungraded) history. Raw prices are out of scope for now.
- No long-range views (3M/6M/1Y) in the UI yet. 30 days is enough (owner). The data model must keep everything so they can be added later.
- No recording from search/seller list pages (my call: product pages only, where the product identity is certain).

## 1. Recording sightings

**When:** at the end of every `runScan` on a product page (`isProductPage()`), after `loadAllResults`, using the listings from `scanListings()`. Recording uses all graded listings (every grader, independent of the popup's enabled-graders filter), the same rule favourites use: a listing is graded if `detectGrade` returns a grade.

**What (my call — store raw sightings, not daily minima):** page filters (language, condition, seller country…) change which listings are visible. Storing "the lowest price on screen" would let a filtered visit write wrong history. Storing each listing lets every displayed number be recomputed correctly.

**Product key:** the product page URL path with the locale prefix and query/hash removed, e.g. `Pokemon/Products/Singles/Base-Set/Charizard-V1-BS4` from `https://www.cardmarket.com/en/Pokemon/...?language=1`. Same card on `/de/` and `/en/` → same key.

**Storage:** `chrome.storage.local`, one key per product: `hist:<productKey>`. Add the `unlimitedStorage` permission (my call; the default local quota is 10 MB and the data is meant to grow for years).

Shape (builder may adjust field names; keep it compact):

```js
"hist:Pokemon/Products/Singles/Base-Set/Charizard-V1-BS4": {
  name: "Charizard (4) - Base Set",          // page title, for export readability
  scans: [["2026-11-04", null], ["2026-11-20", ["en", "ja"]]],  // [date, language filter or null = all]
  listings: {
    "articleRow1234567": {                    // the row id = Cardmarket's article id
      grader: "PSA", grade: "9", gradeText: "PSA 9",
      language: "en",                         // canonical code, not the localized name
      points: [["2026-11-04", 145.0], ["2026-11-20", 139.0]],  // [local date, price]
      lastSeen: "2026-11-21"
    }
  }
}
```

Rules:
- One point per listing per day at most. Seeing it again on the same day with the same price changes nothing; a different price that day replaces that day's point.
- On a later day: same price → only `lastSeen` moves forward; different price → append a point and move `lastSeen`.
- A listing's grade/language are taken from the latest sighting (sellers can edit comments).
- Every scan also appends `[today, languageFilter]` to `scans` (one entry per day; a later scan that day replaces it, union of languages). This lets the graph tell "checked and gone" apart from "not checked" (my call).
- **Language is stored as a canonical code** (my call). `readListing`'s language name is localized per site locale ("English" / "Englisch"), and /en/ and /de/ share a product key, so names would split buckets. Map Cardmarket's language to a fixed code (e.g. `en`, `de`, `fr`, `it`, `es`, `pt`, `ja`, `ko`, `zh-cn`, `zh-tw`, `ru`), preferring a locale-independent attribute (flag icon class / sprite position or the URL `language` id) over the tooltip text; builder verifies on the live site which one is stable. Unknown → keep the raw text so nothing is lost.
- Listings with an unparseable price (`price === null`) are skipped.
- Dates are local calendar dates (`YYYY-MM-DD`).
- Write once per scan (read the product's record, merge, write), not once per listing.

Put the merge logic in a new pure module `lib/history.js` (UMD like the others, with `node --test` tests): `productKeyFromUrl(url)`, `mergeSightings(record, listings, today)`, plus the read-side helpers below.

## 2. "Last seen" in the graded grid

The grid (grader rows × grade columns, high → low, from `renderOverview`) gains cells for grades that only exist in history.

- Live listing for that grade on the page → cell shows the live lowest price, exactly as today.
- No live listing but history has one → faded cell (reduced opacity, `text-muted`-style) with the last known price and date, e.g. `€145 · 12 Aug`. Hover title: `Last seen 12 Aug 2026 (English)`.
- "Last known price" for a grade = from the history sightings of that grade (and language, see below), take those with the most recent `lastSeen`; among those, the lowest price as of that day.
- Grades and graders that appear only in history are added as rows/columns, so the grid can show history even when the page has zero graded listings right now. If there's neither live nor history data, the graded box is not shown (as today).

**Language rule:**
- The page's language filter is a **set** (Cardmarket's language filter is multi-select; parse every value of the `language` URL parameter). If set, live and history cells only use languages in that set; faded cells show their language code when the set has more than one language (my call).
- Without a language filter, live cells stay as today (all languages); faded history cells show the language they come from: `€145 · JP · 12 Aug`. Builder picks the short language code mapping from Cardmarket's language names.

**Visual:** faded cells must be clearly "history, not live" at a glance. No other change to the grid's look.

## 3. Graded graph in Cardmarket's graph position

**Cardmarket today (checked on Charizard Base Set, 2026-11-04):** Chart.js 2.7.2 loaded by the page; three canvases (`.chartjs-render-monitor` inside `.chart-container`) in the Info / Chart / Sell tabs (`#tabContent-info`, `#tabContent-chart`, `#tabContent-sell`); one line "Avg. Sell Price", category x-axis with 30 daily `dd.mm.yy` labels. The page's `Chart` lives in the page's main world. Our content script is isolated and can't use it.

**Switch:** above each of Cardmarket's price graph containers, a small two-option switch **Cardmarket avg | Graded**, styled with Cardmarket's own Bootstrap button-group classes. "Cardmarket avg" = their graph, untouched. "Graded" = hide their canvas (`display: none` on their canvas or its container only), show ours in the same box at the same size. Switching back removes/hides ours and restores theirs exactly. Remember the last choice (`chrome.storage.local`), default **Cardmarket avg**. Only inject the switch when we have any graded data (live or history) for this card.

**Rendering (my call):** draw our own chart as inline SVG from the content script, no library. That avoids bundling Chart.js and avoids injecting into the page's main world. It must look like it belongs next to theirs: same box, similar line weight, axis label sizes and gridlines, using page colours (Bootstrap CSS variables) so it works in Cardmarket's light and dark themes.

**Content (modelled on Collectr's graded graph):**
- X-axis: the last 30 days, ending today.
- One line per grade (grader + grade) in the chosen language. Value per day = lowest price among that grade's listings that were "on sale" that day. A listing counts as on sale from each point's date until its `lastSeen`, at that point's price.
- Lines are drawn flat between changes (step/carry-forward, like Collectr). Small dots mark days we actually saw a listing, so a long dot-less flat stretch reads as "not checked since", not "price held".
- A listing is on sale from its first point until its `lastSeen`; after that, it stays "possibly on sale" (carry-forward) only until the next scan that covered its language (`scans`) and did not see it — then it's gone. When no listing of a grade is on sale, that grade's line ends (my call: no line for a grade we know is gone). Its last price lives on in the grid's faded cell and the legend entry, which then shows the faded `€145 · 12 Aug` form.
- A grade whose last sighting is older than the 30-day window, and not known gone, starts the window at its last known value.
- Colours: shades of the grader's colour from `GRADING_PATTERNS` (darker/lighter per grade), like Collectr's per-grader colour families.
- **Language picker** next to the title (small select). Default: the page's language filter if one is set, else the language with the most sightings for this card. Lists only languages that have graded data.
- **Legend under the graph as a grid:** one column per grader, one row per grade (high → low), each entry `PSA 10 (€19.443)` with that grade's current/last price. Clicking an entry toggles its line; hidden entries are struck through. Initially visible: the highest grade per grader; all others start struck through. (Owner: "PSA 9 crossed through, you can click on it to turn the line on".)
- Hover: tooltip with date, grade and price for the nearest day.
- Prices formatted like the page (`€145,00` style, same as `priceText`).
- Empty state (switch on Graded, no data for the chosen language within 30 days and no earlier value): short muted text "No graded sightings yet for this language".

## 4. Export / Import (popup)

- Popup gets two buttons in a small "Price history" section: **Export** and **Import**, plus a one-line count ("History: 132 cards, 1.204 listings").
- Export: download one JSON file `cardmarket-graded-history-YYYY-MM-DD.json` containing `{ version: 1, exportedAt, products: { <productKey>: <record> } }`.
- Import: pick a JSON file of that format and **merge** it into existing history (per listing: union of points by date; later `lastSeen` wins). Never wipe existing data on import. Invalid file → short error message, nothing changed.
- Merge logic lives in `lib/history.js` and is tested. `scans` are merged as a union by date.

## 5. Testing

- `lib/history.js` unit tests (`node --test`): product key from URLs (locales, query, hash); merging same day / new day / price change / grade change; skipping null prices; last-seen per grade + language; daily lowest series with carry-forward and dot days; import merge.
- Manual check on a real product page: grid faded cells appear after a grade disappears (can be simulated by filtering the page to a language without that grade), switch hides/restores Cardmarket's graph cleanly in all three tabs, light and dark theme.

## Owner's decisions

- Keep every sighting; show history per language.
- "Last seen" lives in the existing graded grid.
- Graph in Cardmarket's graph position, 30 days, Collectr-style legend with click-to-toggle lines.

## My calls (owner can override)

- Raw per-listing sightings instead of daily minima.
- Product pages only; no recording from list pages.
- `unlimitedStorage` permission.
- Own SVG chart behind a switch instead of adding lines to Cardmarket's Chart.js instance (their axis is a fixed 30-label category axis and graded prices would flatten their line).
- Switch defaults to Cardmarket avg; flat lines with sighting dots.
- Per-product scan dates are stored so the graph can end a grade's line once a covering scan no longer sees it.
- Language stored as a canonical code; page language filter treated as a set.
