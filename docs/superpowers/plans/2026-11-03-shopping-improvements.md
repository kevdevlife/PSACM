# Cardmarket Shopping Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix grade-scanning bugs and add a photo filter, listing favourites, a per-condition price overview and remember-me to the Cardmarket Grading Scanner extension.

**Architecture:** Pure logic (grade detection, price parsing, overview, favourite records) moves into small `lib/*.js` files that work both as content-script globals and as Node modules, so they can be unit-tested with `node --test`. DOM work stays in `content.js` (product pages) plus a new `auth.js` (remember-me, all pages). `background.js` gains cookie keep-alive. Everything injected into Cardmarket is additive: no moving, hiding or restyling of Cardmarket's own nodes.

**Tech Stack:** Chrome MV3, plain JS (no build step, no dependencies), Node 22 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-03-shopping-improvements-design.md`

## Global Constraints

- No site restyling: never move, hide, re-parent or restyle Cardmarket's own nodes; never add site-wide CSS; never put anything inside the add-to-basket `<form>`.
- Use Cardmarket's existing Bootstrap classes for injected UI.
- Product-feature scope: star, photo filter, overview, jump-to-favourite run only on product detail pages. Remember me runs on every Cardmarket page.
- No backwards compatibility for stored data; discard old-format favourites (no `condition` field).
- Untrusted text (seller names, comments, card names) is inserted with `textContent` or escaped; never raw into `innerHTML`.
- Never use `alert()`/`confirm()`; notices are injected Bootstrap alerts.
- Credentials are stored only in `chrome.storage.local`, sent only to Cardmarket's own login form, never logged.
- Bump `manifest.json` version once, to `3.0`, in the final task.

## Review Focus

1. Prices with thousands separators (`1.234,56 €`) and rows with no price → parsed correctly / skipped, never `NaN` in the overview. (Task 2 test)
2. Listings with no seller comment → still get a star, count as raw in the overview, never crash the scan. (Task 3 test)
3. Seller/card names containing `<`, `&`, quotes → shown literally in popup and notices. (Task 5 test via `escapeHtml`)
4. Clicking the star → never submits the basket form or toggles anything else on the row. (Task 6 manual check)
5. Auto sign-in failure → exactly one attempt, then stopped until credentials re-saved or retry clicked. (Task 8 test on `shouldAttemptLogin`)

---

### Task 1: Test harness + grade detection library (spec §1b)

**Files:**
- Modify: `package.json` (scripts.test)
- Create: `lib/grading.js`
- Create: `tests/grading.test.js`
- Modify: `content.js` (remove `GRADING_PATTERNS`, `NEGATION_CUES`, `isNegatedMatch`; use the library)
- Modify: `manifest.json` (content_scripts js: `["lib/grading.js", "content.js"]`)

**Interfaces:**
- Produces (globals in content scripts / popup, `module.exports` in Node):
  - `GRADING_PATTERNS` — same array as today (name, pattern, color).
  - `detectGrade(text: string) -> { grader: string, grade: string, gradeText: string, color: string } | null` — `gradeText` is normalised `"<GRADER> <grade>"`, e.g. `"PSA 10"`, `"BGS 9.5"` (Beckett maps to BGS). Checks all graders in `GRADING_PATTERNS` order; skips matches that are negated (prefix) or "potential" (suffix); returns the first valid match.
  - `isNegatedMatch(text, index) -> boolean` (existing logic, unchanged).
  - `isPotentialMatch(text: string, matchEnd: number) -> boolean`.

Every `lib/*.js` file uses this wrapper so it works in both environments:

```js
(function (root) {
    // ... definitions ...
    const api = { /* exported names */ };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis);
```

- [ ] **Step 1: Set `"test": "node --test tests/"` in `package.json`.**

- [ ] **Step 2: Write failing tests in `tests/grading.test.js`** (`node:test` + `node:assert/strict`):

```js
test("flags plain graded listing", () => {
    assert.deepEqual(detectGrade("psa 10 gem mint slab").gradeText, "PSA 10");
});
test("normalises missing space and beckett", () => {
    assert.equal(detectGrade("PSA10").gradeText, "PSA 10");
    assert.equal(detectGrade("beckett 9.5 black label").gradeText, "BGS 9.5");
});
test("Doktor535 false positive is not graded", () => {
    assert.equal(detectGrade("boosterfrisch->Sleeve->Magnetcase->PSA10 Chance"), null);
});
test("potential wording after grade is not graded", () => {
    for (const t of ["psa 10 potential", "PSA 10 candidate!", "psa10 ready", "psa 10 worthy",
                     "possible: psa 10 quality", "cgc 10 material", "psa 10 hope",
                     "PSA 10 möglich", "psa 10 potenzial", "psa 10 kandidat"]) {
        assert.equal(detectGrade(t), null, t);
    }
});
test("negation before grade is not graded", () => {
    assert.equal(detectGrade("not a psa 10"), null);
});
test("words after a sentence boundary don't count as potential", () => {
    assert.equal(detectGrade("PSA 10. Chance to grab a deal").gradeText, "PSA 10");
});
test("first valid grader wins over a potential one", () => {
    assert.equal(detectGrade("CGC 9.5 slab, psa 10 chance").gradeText, "CGC 9.5");
});
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL (cannot find `../lib/grading.js`).

- [ ] **Step 4: Implement `lib/grading.js`.** Move `GRADING_PATTERNS`, `NEGATION_CUES`, `isNegatedMatch` from `content.js`. Make the patterns global (`/g`) or loop with `matchAll` so a skipped match lets a later match of the same grader be tried. `isPotentialMatch` looks at the text from `matchEnd` up to the first of `. ! ? , ;` or 30 chars, and tests the first 3 words against `/\b(chance|potential|candidate|ready|worthy|possible|quality|material|hope|möglich|potenzial|kandidat)\b/i` (`chance` covers German too). Grade value = the numeric part of the match.

- [ ] **Step 5: Run `npm test`.** Expected: all PASS.

- [ ] **Step 6: Update `content.js`** so `scanGradedCards` calls `detectGrade(text)` instead of its own loop, and add `lib/grading.js` before `content.js` in `manifest.json`. Load the unpacked extension, open the Mega Latias page, and confirm the Doktor535 row no longer has a coloured border.

- [ ] **Step 7: Commit** `feat: grade detection library with potential-wording filter`.

---

### Task 2: Price parsing + overview library (spec §3 logic)

**Files:**
- Create: `lib/prices.js`, `tests/prices.test.js`
- Modify: `manifest.json` (add `lib/prices.js` before `content.js`)

**Interfaces:**
- Produces:
  - `CONDITION_ORDER = ["MT","NM","EX","GD","LP","PL","PO"]`
  - `parsePrice(text: string) -> number | null` — `"70,00 €"` → `70`, `"1.234,56 €"` → `1234.56`, `""`/`"N/A"` → `null`.
  - `buildOverview(listings: Listing[]) -> { raw: {code, priceText}[], graded: {gradeText, grader, grade, color, priceText}[] }`, where `Listing` is defined in Task 3. Raw lines only from listings with `grade === null`, in `CONDITION_ORDER`; graded lines one per `gradeText`, sorted by grader index in `GRADING_PATTERNS`, then grade numerically descending. Each line's `priceText` is the original text of its cheapest listing. Listings with `price === null` are ignored.

- [ ] **Step 1: Write failing tests**: `parsePrice` cases above; `buildOverview` with fixtures: two NM raw (70 and 85), one MT raw, one NM listing graded PSA 10 at 50 → raw NM priceText is the 70 one (the graded 50 is excluded), MT line present, order MT before NM; graded `[PSA 10, PSA 9, CGC 10]` input order shuffled → output `PSA 10, PSA 9, CGC 10`; a listing with `price: null` is ignored; empty input → `{raw: [], graded: []}`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `lib/prices.js`** (`buildOverview` requires `GRADING_PATTERNS`: in Node `require("./grading.js")`, in the browser the global).
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: price parsing and condition overview logic`.

---

### Task 3: Listing reader, product-page gate, always-visible grade tag (spec §1a)

**Files:**
- Modify: `content.js`

**Interfaces:**
- Consumes: `detectGrade`, `parsePrice`.
- Produces (in `content.js`):
  - `isProductPage() -> boolean` — true when `location.pathname` contains `/Products/`, does not contain `/Products/Search`, and the page has `.page-title-container h1` and at least one `.article-row`.
  - `readListing(row: Element) -> Listing | null`, where `Listing = { id, url, cardName, seller, conditionCode, language, priceText, price, hasPhoto, grade, row }`. `id = row.id` (null → return null); `url` = page URL with `#id`; `seller` from `.seller-name a`; `conditionCode` from `.article-condition .badge` text; `language` from the `data-bs-original-title`/`aria-label` of the language icon in `.product-attributes`; `priceText` from `.price-container .text-end`; `hasPhoto` = row has `.fonticon-camera`; `grade` = `detectGrade(comment text)` over **all** graders (missing comment → `null`).
  - `scanListings() -> Listing[]` — all rows on the page; caches the result in a module-level `currentListings`.
  - `gradedHits(listings, enabledCompanies) -> Hit[]` — listings with a grade whose grader is enabled. In this task a Hit is `{ id, url, cardName, seller, priceText, language, grader, gradeText, color }` so the current popup keeps working; Task 5 changes it to the favourite shape.

- [ ] **Step 1: Refactor** `scanGradedCards` into `scanListings` + `gradedHits`. Both `autoScan` and the `SCAN_GRADED` handler use them; they return early unless `isProductPage()`. The cache payload and `sendResponse` carry `gradedHits(...)`.
- [ ] **Step 2: Move the grade badge**: `injectPageHighlights` appends `.gs-grade-badge` as the last child of the row's `.product-attributes` (not inside the comment span). Keep the left border.
- [ ] **Step 3: Manual check** on the Mega Latias page: every graded row shows its badge next to the language flag, including rows with long comments. Rows without a comment don't throw (check the console for `[Grading Scanner]` errors). The Doktor535 row is still unmarked.
- [ ] **Step 4: Commit** `refactor: per-row listing reader; grade badge always visible`.

---

### Task 4: Unified visibility + "Only with photo" filter (spec §2)

**Files:**
- Modify: `content.js`

**Interfaces:**
- Consumes: `currentListings`.
- Produces:
  - `filterState = { graders: Set<string>, photoOnly: boolean }`
  - `applyVisibility()` — for each listing row, sets `row.style.display = ""` or `"none"`. Visible iff (`graders` empty or the row's grader ∈ `graders`) and (`!photoOnly` or `hasPhoto`). This replaces `applyGraderFilter`; the Graded Cards checkboxes now update `filterState.graders` and call `applyVisibility()`.
  - `injectPhotoFilter()` — accordion item `id="gs-photo-accordion-item"`, header "Photo", one `form-check` checkbox "Only listings with photo", inserted right after the Graded Cards item (or first if that is absent). State is persisted as `chrome.storage.local.photoOnly` (default `false`) and restored on load.

- [ ] **Step 1: Implement** the functions above. `injectPhotoFilter` runs from `autoScan` after `scanListings`, and is idempotent (remove an existing `#gs-photo-accordion-item` first).
- [ ] **Step 2: Manual check**: tick Photo → only rows with a camera icon remain. Also tick PSA → only PSA rows with photos remain. Reload → Photo is still ticked and applied. Cardmarket's own Filter button still works.
- [ ] **Step 3: Commit** `feat: only-with-photo filter`.

---

### Task 5: Favourites library + popup Condition column (spec §4 data + popup)

**Files:**
- Create: `lib/favorites.js`, `tests/favorites.test.js`
- Modify: `popup.html` (load `lib/grading.js`, `lib/favorites.js` before `popup.js`; column widths), `popup.js`
- Modify: `manifest.json` (add `lib/favorites.js` before `content.js`)

**Interfaces:**
- Produces:
  - `Condition = { type: "raw", code: "NM" } | { type: "graded", grader: "PSA", grade: "10", gradeText: "PSA 10", color }`
  - `conditionOf(listing: Listing) -> Condition`
  - `makeFavorite(listing: Listing) -> Favorite` = `{ id, url, cardName, seller, priceText, language, condition, savedAt: Date.now() }`
  - `isValidFavorite(f) -> boolean` — has `id`, `url` and `condition.type`.
  - `CONDITION_COLORS: Record<code, hex>` — copy each condition's badge background from the live site (computed `background-color` of `.article-condition.condition-<code> .badge`, codes lowercase) for all 7 codes.
  - `escapeHtml(s: string) -> string`
  - `getFavorites() -> Promise<Favorite[]>` (returns valid ones only, and rewrites storage without invalid ones), `setFavorite(fav)`, `removeFavorite(id)`, all using `chrome.storage.local.favorites`.

- [ ] **Step 1: Write failing tests**: `conditionOf` raw vs graded; `makeFavorite` copies fields and sets `savedAt`; `isValidFavorite` rejects the old shape `{anchorName, grader, gradeText, url}`; `escapeHtml('<b>&"\'')` → `&lt;b&gt;&amp;&quot;&#39;`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** `lib/favorites.js` (skip the storage functions in Node: guard on `typeof chrome`).
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Rework `popup.js`**:
  - Scan table columns: Condition | Seller | Price | ★.
  - Favourites table columns: Card | Condition | Seller | Price | ★.
  - Condition cell: raw → a badge with the `code` and `CONDITION_COLORS[code]` background; graded → the existing grader-badge style with `gradeText` and `color`.
  - All interpolated text goes through `escapeHtml`.
  - Change `gradedHits` in `content.js` to return `makeFavorite(listing)` objects without `savedAt` (Hit = Favorite minus `savedAt`). Stars use `setFavorite(hit)`/`removeFavorite(id)` keyed by `id`; `setFavorite` adds `savedAt`.
  - Remove `sortByGradeAndPrice`'s dependency on `gradeText`: sort graded hits by `parsePrice` ascending (load `lib/prices.js` in the popup too).
- [ ] **Step 6: Manual check**: scan → the table shows graded rows with seller. Starring one → it shows up under Favorites with its card name. Unstarring in Favorites removes it.
- [ ] **Step 7: Commit** `feat: favourites with single condition column`.

---

### Task 6: Star on every listing + exact jump with sold/removed notice (spec §4 page)

**Files:**
- Modify: `content.js`

**Interfaces:**
- Consumes: `currentListings`, `makeFavorite`, `getFavorites`, `setFavorite`, `removeFavorite`.
- Produces:
  - `injectStars()` — for each listing, one `button.btn.btn-sm.gs-fav-star` (`type="button"`, `aria-pressed`, `title="Favourite"`), inserted as the sibling directly before the row's basket `<form>` (or before `.actions-container`'s first child that is a form; never inside a form). Text ☆ / ★; the saved state is coloured `#f5c518`. On click: `e.preventDefault(); e.stopPropagation();` then toggle. Idempotent per row (`data-gs-star`).
  - `refreshStars(favoriteIds: Set<string>)` — updates every star. It is called after `injectStars` and from `chrome.storage.onChanged` when `favorites` changes.
  - `jumpToHash()` — replaces `scrollToSellerFromHash`. It is called only after `loadAllResults()` has resolved (from the end of `autoScan`) and on `hashchange`. If the hash starts with `articleRow` and `document.getElementById(hash)` exists → existing scroll + outline highlight. Otherwise call `showNotice("This listing has been sold or removed.")`.
  - `showNotice(text)` — a dismissible `div.alert.alert-warning.alert-dismissible` (text via `textContent`, close `button.btn-close`), inserted at the top of the listings table container. Only one at a time.

- [ ] **Step 1: Implement**, and delete the top-level `scrollToSellerFromHash()` call and listener.
- [ ] **Step 2: Manual check**:
  - A star is visible next to every basket button.
  - Clicking the star does not add anything to the basket and the quantity select is unchanged.
  - The popup shows the favourite immediately.
  - Unstar from the popup → the page star empties without a reload.
  - Click a favourite in the popup for a listing behind "load more" → the page scrolls to it.
  - Edit the URL hash to `#articleRow1` → the notice appears and can be dismissed.
- [ ] **Step 3: Commit** `feat: favourite any listing from the page; exact jump with notice`.

---

### Task 7: Condition overview on the page (spec §3 render)

**Files:**
- Modify: `content.js`

**Interfaces:**
- Consumes: `buildOverview`, `currentListings`, `CONDITION_ORDER`.
- Produces: `renderOverview()` — one `div#gs-overview` inserted directly above the listings table (before `.table-header`'s parent section). It contains two flex-wrapped lines of small items: raw items as Cardmarket's own markup `<span class="article-condition condition-<code lower>"><span class="badge">NM</span></span> from 70,00 €`, and graded items as the `.gs-grade-badge` style with `gradeText` + ` from <priceText>`. Hide a line that has no items; render nothing if both are empty. Not clickable. Re-rendered at the end of `autoScan` and the `SCAN_GRADED` handler (replace the existing element).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual check** against the Mega Latias page:
  - The NM and MT "from" prices equal the cheapest *ungraded* row of each condition (spot-check by sorting by price).
  - PSA 10 shows the cheapest PSA 10 row.
  - Nothing in the overview is clickable.
- [ ] **Step 3: Commit** `feat: per-condition price overview`.

---

### Task 8: Remember me (spec §5)

**Files:**
- Create: `lib/auth-state.js`, `tests/auth-state.test.js`, `auth.js`
- Modify: `background.js`, `popup.html`, `popup.js`, `manifest.json`

**Interfaces:**
- Produces:
  - `lib/auth-state.js`: `shouldAttemptLogin(state) -> boolean`, where `state = { enabled, hasCredentials, loggedIn, paused, failed }`. It is true only when enabled, has credentials, not logged in, not paused, and not failed.
  - Storage key `chrome.storage.local.rememberMe = { enabled, username, password, paused: false, failed: null | string }`.
  - Message `{ action: "AUTH_RETRY" }` from popup → clears `failed` and `paused`.
- `manifest.json`: permissions add `"cookies"`, `"alarms"`; add `"host_permissions": ["https://www.cardmarket.com/*"]`; add a second content_scripts entry `{ matches: same as now, js: ["lib/auth-state.js", "auth.js"], run_at: "document_idle" }`.

- [ ] **Step 1: Write failing tests** for `shouldAttemptLogin`: the happy path is true; each of `!enabled`, `!hasCredentials`, `loggedIn`, `paused` and `failed: "captcha"` gives false.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL. **Step 3:** Implement. **Step 4:** Run `npm test`, expect PASS.
- [ ] **Step 5: Inspect the site** (logged out and logged in): note the session cookie name/expiry and the header login form's selectors (`form[action*="Login"]`, username/password field names, submit). Note what a failed login, a captcha and extra verification look like. Logged-in detection = a logout link/form present (`a[href*="Logout"], form[action*="Logout"]`, confirmed on the live site). Record the findings as a short comment at the top of `auth.js`.
- [ ] **Step 6: Keep-alive in `background.js`**:
  - `chrome.cookies.onChanged`: when a cardmarket.com session cookie (no `expirationDate`) is set, re-set it with `expirationDate = now + 30 days`. Skip this when `rememberMe.enabled` is false.
  - `chrome.alarms` every 20 minutes: if enabled, `fetch("https://www.cardmarket.com/en/", { credentials: "include" })`. One request per alarm, nothing else.
- [ ] **Step 7: Auto sign-in in `auth.js`**:
  - Logout detection: on a logout link/form click → set `paused: true`.
  - On load: if `shouldAttemptLogin` → save `location.href` in `sessionStorage.gsReturnTo`, show the notice "Signing you in…", fill the form and submit.
  - On the next load: if logged in and `gsReturnTo` is set → clear it and, if it differs from the current URL, `location.replace` it. If still logged out after an attempt (detected via `sessionStorage.gsAttempted`) → set `failed` to a short reason (`"wrong-credentials"`, `"captcha"`, `"verification"`, `"unknown"`) and show a notice saying sign-in stopped and to re-save details or click Retry in the popup.
  - A manual successful login clears `paused`.
- [ ] **Step 8: Popup section "Remember me"**:
  - Controls: toggle, username, password (`type="password"`), Save, "Forget details" (removes `rememberMe`), and a Retry button shown only when `failed` is set, together with the reason.
  - Saving clears `failed`/`paused`.
- [ ] **Step 9: Manual check**:
  - Enable and save → close the browser → reopen Cardmarket → you are still logged in (keep-alive).
  - Delete the session cookie in devtools → reload → the notice appears, you are signed in and land back on the same page.
  - Log out manually → reload → you stay logged out.
  - Save a wrong password and force a logout → exactly one attempt, then the failure notice. Further reloads don't attempt again.
  - Forget details → the storage key is gone.
- [ ] **Step 10: Commit** `feat: remember me (keep-alive + auto sign-in)`.

---

### Task 9: Release check

**Files:**
- Modify: `manifest.json` (`"version": "3.0"`; update the description to mention favourites, photo filter, price overview, remember me)

- [ ] **Step 1: Run `npm test`.** Expected: all PASS.
- [ ] **Step 2: Regression pass** on the Mega Latias page and one seller shop page:
  - Add-to-basket, quantity select, Cardmarket's own filters + Filter button, header search suggestions and the account dropdown all work.
  - The seller shop page shows no stars, overview or photo filter.
- [ ] **Step 3: Commit** `chore: release 3.0`.
