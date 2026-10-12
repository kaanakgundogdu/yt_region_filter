# YT Region Filter

A tiny Chrome extension (Manifest V3, plain JavaScript, no build step) that hides **off-context Turkish recommendations** on YouTube's watch page: the "Up next" sidebar, the end-screen grid, and autoplay.

## Why

YouTube's recommendation engine leans heavily on your **IP location**, not on your account region setting. Living in, or connecting from, Turkey means that while you watch, say, an English *One Piece* chapter review, the "Up next" sidebar keeps serving Turkish political videos that have nothing to do with it. Changing the region and turning off homepage recommendations doesn't help.

Recommendations *related* to the video are useful, so this extension doesn't blanket-ban a language. Instead it:

- **hides Turkish cards in the sidebar and in the end-screen grid** when the video you're watching is **not** Turkish;
- **cancels autoplay** when the "Up next" video is Turkish and off-context, so it doesn't start on its own;
- **leaves everything alone** when you're watching a Turkish video (context rule);
- **sees through auto-translated titles**: YouTube now translates titles into your UI language, so a Turkish video can show up as *"Veteran Journalist Calls for Early Elections!…"*. The extension looks up the original title and catches it anyway.

## How it works

```
sidebar card ──► shown title ──► Turkish? ──yes──► hide (unless current video is Turkish)
                                     │
                                     no
                                     ▼
                     original title via /oembed ──► Turkish? ──yes──► hide (unless current video is Turkish)
```

1. **Detection** ([`src/detect.js`](src/detect.js)) is a small, synchronous, deterministic heuristic that returns a 0–1 score:
   - Turkish-only letters `ı İ ğ Ğ ş Ş` are a strong signal, checked on the raw string so ALL-CAPS titles like `TÜRKİYE'NİN…` work.
   - `ç ö ü` are a weak signal, since German and French use them too.
   - A short list of Turkish stopwords (`ve`, `bir`, `neden`, `nasıl`…) is matched after Turkish-locale lowercasing.
   - English sentences that merely contain one Turkish name ("Even Erdoğan knows: this isn't…") are not counted as Turkish.
2. **Original titles**: YouTube doesn't mark translated titles in the DOM, but the same-origin `/oembed` endpoint returns the original title. Lookups only happen when the shown title isn't already Turkish; they are cached per video and capped at 3 concurrent requests. No extra permissions are needed.
3. **Filtering** ([`src/content.js`](src/content.js)) watches the sidebar and the end screen with a debounced `MutationObserver`, handles YouTube's SPA navigation (`yt-navigate-finish`) and recycled DOM nodes, and only toggles CSS classes. Nothing is ever removed from the page.
4. **Selectors** are all in [`src/selectors.js`](src/selectors.js). When YouTube changes its markup, that's the only file that should need fixing.

## Install (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repository folder (the one containing `manifest.json`).
4. Reload any open YouTube tabs.

## Usage

Click the toolbar icon to open the popup:

| Control | Effect |
|---|---|
| **Filter enabled** | Turn filtering on or off instantly, no reload needed. |
| **Mode: Hide / Dim** | Remove cards from view, or fade them so you can see what would be hidden. |
| **Hidden on this page** | Number of cards filtered on the last active watch page. |

### Debug mode

Debug mode shows a score label on every sidebar card, e.g. `0.95 translated hidden`. To turn it on, right-click the popup → **Inspect** → Console:

```js
chrome.storage.sync.set({ debug: true })   // false to turn off
```

## Permissions

- `storage`: saves your settings and the hidden-card counter.
- Content script on `https://www.youtube.com/*` only.

No data leaves your browser except the `/oembed` title lookups, which go to YouTube itself.

## Tests

`tests/detect.test.html` runs the detection test suite in the browser. Open it in Chrome and look for the green **ALL PASSED** bar. To run it headless (no Node required):

```bash
chrome --headless=new --user-data-dir=/tmp/ytrf --dump-dom file:///path/to/yt_region_filter/tests/detect.test.html | grep -o "ALL PASSED: [0-9/]*"
```

## Known limitations

- Turkish titles with no Turkish-specific letters and at most one common word can slip through.
- Short English titles containing a Turkish name and fewer than two English stopwords may be hidden.
- A translated Turkish card can be visible for a moment until its original title arrives.
- Only the watch page is filtered (sidebar, end screen, autoplay). The homepage, Shorts and search are not.
- A Turkish autoplay is cancelled, not replaced; pick the next video from the end screen.
- Turkish is the only target language for now.

## Project layout

```
manifest.json
src/
  selectors.js     DOM selectors (single source of truth)
  detect.js        Turkish detection heuristic
  content.js       scanning, oEmbed lookup, hide/dim, settings
  content.css      hide/dim/debug styles
  popup/           toolbar popup (HTML/CSS/JS)
tests/
  detect.test.html browser-based unit tests for detect.js
icons/             toolbar icons ("no region" pin; icon.svg source + 16/32/48/128 PNGs)
CLAUDE.md          design notes, contracts and working rules
```

## License

[MIT](LICENSE)
