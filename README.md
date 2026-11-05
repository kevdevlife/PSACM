# Cardmarket Grading Scanner

A Chrome extension that scans Cardmarket for graded listings (PSA, CGC, BGS, TAG, ACE, MNT, SGC), with favourites, a photo filter, a price overview and graded price history.

## Installation

The extension is not in the Chrome Web Store, so you load it as an unpacked extension.

1. Download the code:
   - with Git: `git clone git@github.com:nielsvantslot/PSACM.git`
   - or on GitHub: **Code → Download ZIP**, then unzip it
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Optional: click the puzzle icon in the toolbar and pin **Cardmarket Grading Scanner**.

This also works in other Chromium browsers, such as Edge or Brave.

## Usage

1. Open a card page on [cardmarket.com](https://www.cardmarket.com).
2. Click the extension icon and press **Scan Page** to find graded listings.
3. Use the filter sidebar and price chart on the page to narrow down the results.

## Updating

1. Get the latest code (`git pull`, or download the ZIP again and replace the folder).
2. Go to `chrome://extensions` and click the reload icon on the extension.
3. Refresh any open Cardmarket tabs.

## Development

The tests use Node's built-in test runner; there are no dependencies to install.

```bash
npm test
```
