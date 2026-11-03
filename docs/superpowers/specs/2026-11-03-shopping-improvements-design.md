# Cardmarket Grading Scanner — shopping improvements

Date: 2026-11-03
Extension: Chrome MV3, plain JS, no build step (`manifest.json`, `content.js`, `popup.html`/`popup.js`, `background.js`).

## Intent

The extension started as a graded-card scanner. The owner uses it as a general shopping aid on Cardmarket and wants five improvements that remove day-to-day friction, without touching Cardmarket's own look.

**Hard anti-goal:** no site restyling. A previous UI overhaul (custom theme CSS, collapsible rows, moving Cardmarket's own buttons/forms) broke core site functions and was fully reverted. Everything added here must be *additive*: insert small elements, never move, hide, restyle, or re-parent Cardmarket's own nodes (especially anything inside the add-to-basket `<form>`), and never change site-wide CSS. Use Cardmarket's existing Bootstrap classes where possible so additions look native.

No backwards compatibility is required for any stored data (favourites, cache). Old-format data may be discarded.

## Scope: product detail pages only

All new features (star, photo filter, overview, jump-to-favourite) run only on single-product detail pages like the Mega Latias page, where every `.article-row` is a listing of the same card. Seller shop pages and other multi-card listing pages are out of scope (owner's decision). Remember me is the exception: it runs on any Cardmarket page.

## 1. Grade scanning fixes (do first)

Both confirmed on Doktor535's listing at
`https://www.cardmarket.com/en/Pokemon/Products/Singles/Mega-Evolution/Mega-Latias-ex-V3-MEG181?language=1`
(comment: `boosterfrisch->Sleeve->Magnetcase->PSA10 Chance`).

**1a. Grade tag disappears on long comments.** Today the badge is appended inside `.product-comments span.text-truncate`, which has `overflow: hidden` + ellipsis, so long comments push it out of view. Move the badge out of the truncated span to a place that is always visible on the row (e.g. after the condition/language badges in `.product-attributes`). The coloured left border stays.

**1b. False positives for "grade potential" wording.** A grade match followed by words meaning "could become this grade" is not a graded card. Add a suffix check, mirroring the existing `isNegatedMatch` prefix check, for words right after the match, at least: `chance`, `potential`, `candidate`, `ready`, `worthy`, `possible`, `quality`, `material`, `hope`, plus German `chance`, `möglich`, `potenzial`, `kandidat`. Builder may extend the list. Both prefix and suffix checks apply.

## 2. "Only with photo" filter

Cardmarket marks listings with a photo by a `.fonticon-camera` icon inside the row's product column. There's no native filter for it.

- Add an accordion item "Photo" to `#articleFilters`, built the same way as the existing injected "Graded Cards" item, with one checkbox: "Only listings with photo".
- Checked → hide `.article-row`s without the camera icon; unchecked → show them.
- Client-side only (rows are already all loaded by `loadAllResults`). Takes effect immediately, like the Graded Cards filter.
- Must combine with the Graded Cards filter: a row is visible only if it passes every active extension filter. Refactor visibility into one function that evaluates all active extension filters, instead of each filter setting `display` directly.
- Remember the checkbox state across page loads (`chrome.storage.local`).

## 3. Price overview per condition (product detail pages)

A compact, read-only summary above the listings table on product pages.

- One line per condition that appears in the loaded listings, in Cardmarket's order (MT, NM, EX, GD, LP, PL, PO), formatted `NM: from €70,00`: the lowest price among listings of that condition. Condition label uses Cardmarket's own condition badge colours/classes.
- Raw lines count **only ungraded listings**. A graded listing is never counted toward its Cardmarket condition line, even though it carries a condition badge (owner's decision). Same "graded" rule as the scanner (all graders).
- A second group for graded listings, one entry per grader + grade, e.g. `PSA 10: from €180,00`, sorted by grader then grade descending.
- Numbers only: not clickable, no filtering (filtering is done through the filters themselves). No listing counts.
- Based on all rows on the page after `loadAllResults` (so it reflects Cardmarket's own server-side filters in the URL). Whether it should also follow the extension's client-side filters (photo/graded) is left to the builder; keep it simple.
- Recompute after a re-scan from the popup.
- Prices: parse Cardmarket's `70,00 €` format; display in the same format the page uses.

## 4. Favourites for any listing

Exists today only in the popup and only for graded scan results (`chrome.storage.local.favorites`, star in popup table). Rework:

**On the page**
- Every `.article-row` gets a clearly visible star button placed next to the add-to-basket button (inserted as a sibling *outside* the basket `<form>`, never inside it). Outline ☆ when not saved, solid yellow ★ when saved. Clicking it never triggers add-to-basket.
- Works for all listings, graded or not.

**Saved data per favourite**
`id` (the row's `id`, e.g. `articleRow…`), `url` (page URL with `#<rowId>`), `cardName`, `seller`, `price`, `language`, `condition` object, `savedAt`.
`condition` is either `{ type: "raw", code: "NM" }` or `{ type: "graded", grader: "PSA", grade: "10", color }`. A listing is "graded" if the scanner flags it (regardless of which graders are enabled in the popup filter). To support this (my call): scan once against all graders and store the result per row; the popup's enabled-graders list is applied only when displaying (scan table, page badges, Graded Cards filter).

**Popup**
- Favourites list and scan results table replace the separate Grader and Grade columns with one **Condition** column: raw → Cardmarket condition label with Cardmarket's colours; graded → grade badge (e.g. red "PSA 10").
- Favourites list also shows seller.
- Starring/unstarring in the popup and on the page stay in sync (both read/write `chrome.storage.local`; listen to `chrome.storage.onChanged` on the page to update stars).
- Discard old-format favourites (no `condition` field).

**Jumping to a favourite**
- Opens the saved URL. The content script must wait until `loadAllResults()` has finished before looking for the row (today `scrollToSellerFromHash` runs at script start and misses rows behind "load more").
- Found → scroll to it, highlight briefly (existing outline effect).
- Not found → show a clear, dismissible notice on the page: "This listing has been sold or removed." Use a Bootstrap alert/toast style, not a browser `alert()`. Keep the favourite in the list; the user removes it.
- Exact listing only, matched by row id. No fallback by seller name.

## 5. Remember me

Problem: after a break or after closing and reopening Cardmarket, the user is logged out and must sign in again. User accepted storing their password locally.

- **Popup settings:** a "Remember me" section: toggle, username, password, save. One action deletes stored credentials. Store in `chrome.storage.local` (accepted risk: not strongly protected). Credentials go only to Cardmarket's own login form, never anywhere else, never logged.
- **Keep alive (primary):** keep the existing session from being lost: make the session cookie survive browser restarts (via `chrome.cookies`, adding the `cookies` permission and Cardmarket host permission) and/or refresh it with a light periodic request while the browser is open. Builder decides the exact mechanism after inspecting Cardmarket's cookies and session lifetime; it must not cause noticeable traffic.
- **Auto sign-in (fallback):** when a Cardmarket page loads logged-out and Remember me is on, fill Cardmarket's own header login form with the stored details and submit it, then return the user to the page they were on. Show a small "Signing you in…" notice meanwhile.
- **Stop conditions:** if login fails (wrong password, captcha, 2FA/extra verification, unexpected page), stop, don't retry automatically on the next loads until credentials are re-saved or the user clicks retry, and show a notice explaining why. Never loop — at most one automatic attempt per failure state, to avoid account lockout.
- **Manual logout is respected** (my call): when the user clicks Cardmarket's logout, auto sign-in pauses until the user logs in again themselves (or clicks "Sign in" in the popup). Logging out on purpose must stay possible.
- Assumptions (unverified guesses, not confirmed by the owner): single account, no two-step login.

## Order of work

1. Scanning fixes (1a, 1b)
2. Photo filter (2)
3. Favourites (4)
4. Condition overview (3)
5. Remember me (5)

Each is independently shippable. Bump the manifest version once at release.

## Left to the builder

- Exact placement/markup of injected elements, as long as they're additive and use native Bootstrap classes.
- Keep-alive mechanism details, login-form selectors, how logged-out state is detected.
- Suffix word list extensions; whether overview follows client-side filters.
- Splitting `content.js` into multiple files (allowed; list them in the manifest).

## Testing

No test harness exists. Verify manually on a real Cardmarket product page (the Mega Latias URL above covers graded hits, photos, many conditions, and Doktor535's false positive). Check every time that add-to-basket, the quantity selector, Cardmarket's own filters, header search and dropdown menus still work.
