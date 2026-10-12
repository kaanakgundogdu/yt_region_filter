# YT Region Filter: Chrome Extension (Manifest V3)

A small pilot extension that hides **regional (Turkish) recommendations** that are unrelated to the video being watched in YouTube's watch-page "up next" sidebar. Plain JS only: no framework, no bundler, no build step.

## Problem statement
- Homepage recommendations are already turned off (watch history off). The problem is Turkey-sourced, mostly political, videos in the **watch-page sidebar**.
- Recommendations related to the current video are useful and must stay. Only **off-context regional** ones should go.

## Decisions (approved 2026-10-12)
1. **Approach:** Adapted B (see below); A is dropped. The account region is already set to a non-Turkish country and Turkish suggestions still appear, which confirms the signal comes from IP/account, not `gl`.
2. **Scope:** Pilot filters only the watch-page sidebar (the same list that moves below the video on narrow layouts). End screen and Shorts are deferred (STOP-6).
3. **Context rule:** On. If the current video is Turkish, Turkish suggestions are shown.
4. **Mode:** Default **hide**. Debug mode (dim + score label) is for development and tuning.
5. **Target language:** Turkish only. No channel allowlist in the pilot.
6. **Popup:** Minimal (on/off, mode, hidden count).
7. **DOM inspection:** Claude inspects the watch page in the built-in browser, logged out (card structure doesn't depend on the account). If that's insufficient, ask the user for a card's `outerHTML`.
8. **Language:** All repo content (code comments, docs, UI strings, logs) is in English.

**Reference case (user screenshot):** While watching the English *"One Piece Chapter 1195 Review"*, the sidebar shows *"TÜRKİYE'NİN KONUŞTUĞU TEĞMENLER İLK KEZ ..."*. That card must be hidden; the English anime/manga suggestions in the same list must stay.
- The title is **all caps** with `İ`, `Ğ`. Detect special characters on the raw string by regex (`/[ıİğĞşŞ]/`); never `toLowerCase()` first, since `İ` becomes `i̇` (combining dot).
- The visible title may be clipped with "…". Use the full title from the `title` attribute.

## Approach

**A) Forcing `gl`/`hl` (URL / PREF cookie): DROPPED.**
- The region setting already lives in the PREF cookie and didn't help. Recommendations are driven mostly by **IP location and account signals**; `gl` mainly affects trending and UI locale.
- Watch-next results come from `youtubei/v1/next` with `context.client.gl` in the JSON body. Changing it needs fetch/XHR injection in the MAIN world: fragile, invasive, uncertain payoff (IP still dominates).
- URL redirects (declarativeNetRequest) don't fire on SPA navigation and risk redirect loops.

**B) Card-title language detection + hiding: CHOSEN, with two changes:**
1. **Target the watch page, not the homepage** (homepage is already off).
2. **Context rule:** if the current video's title is also Turkish, Turkish suggestions are **not** hidden, so "related suggestions are useful" holds.

Detection is a cheap synchronous heuristic: **Turkish-specific characters** (`ı İ ğ Ğ ş Ş`) plus a small Turkish stopword list. `chrome.i18n.detectLanguage` (CLD) is unreliable on short titles and async, so it isn't used.

**A + B combined:** Not worth it. A's benefit is uncertain and its risk high. If B proves insufficient, A becomes a separate experiment (K8).

**Alternatives noted (out of pilot scope):**
- Intercept `ytInitialData` / `youtubei/v1/next` in the MAIN world and filter items before render. More robust to CSS changes but fragile to schema changes and more invasive.
- Auto-select YouTube's own **"Related"** chip above the sidebar. Doesn't guarantee excluding regional items and the chip DOM is fragile.

## Fragile points and mitigations
| Risk | Mitigation |
|---|---|
| YouTube's DOM changes often. The sidebar moved from `ytd-compact-video-renderer` to `yt-lockup-view-model`; both may coexist. | All selectors live in **one file** (`selectors.js`) and both layouts are supported. |
| SPA navigation: no page reload. | Listen to `yt-navigate-finish` and recompute the context. |
| YouTube **recycles** card nodes (title changes, element stays). | The decision is re-applied on every scan; detection and oEmbed results are cached, so this is cheap. |
| Infinite scroll / lazy loading. | `MutationObserver` on `document.body` (childList + `title` attribute), debounced ~100 ms. |
| YouTube **auto-translates** Turkish titles into the UI language, with no DOM marker. | Fetch the original title from same-origin `/oembed` when the shown title isn't Turkish. |
| Short or mixed-language titles get misdetected. | Score + threshold; debug mode dims instead of hiding and shows the score for tuning. |
| Removing elements can break YouTube's own code. | Elements are **never removed**, only hidden via a CSS class. |

## Folder layout
```
yt_region_filter/
├── CLAUDE.md
├── README.md
├── manifest.json          # MV3; permissions: "storage" + youtube.com content-script match
├── src/                   # content scripts load in manifest order (same isolated world)
│   ├── selectors.js       # ALL DOM selectors live here
│   ├── detect.js          # language detection: pure, synchronous, no DOM/chrome APIs
│   ├── content.js         # scan, decide, hide, oEmbed lookup, observer, SPA nav, settings
│   ├── content.css        # .ytrf-hidden / .ytrf-dim / debug label
│   └── popup/
│       ├── popup.html     # on/off, mode (hide/dim), hidden count
│       ├── popup.css
│       └── popup.js
└── tests/
    └── detect.test.html   # open in a browser; loads detect.js and lists PASS/FAIL
```
> Load order: `selectors.js` → `detect.js` → `content.js`. Shared namespace: `globalThis.YTRF`.
>
> C++ analogy: the manifest's `content_scripts.js` array is like concatenating the files, in order, into one translation unit. No ES modules or imports; order matters.

## Contract
Agents don't change this section. If a change is needed they report it and the main session updates it.

### `detect.js` interface
```js
// globalThis.YTRF.detect
turkishScore(title: string) -> number                  // 0.0–1.0, pure, synchronous, deterministic
isTurkish(title: string, threshold = 0.5) -> boolean   // turkishScore(title) >= threshold
```
- **Why score + boolean:** `content.js` decides with `isTurkish`; the score is shown in the debug label and used for threshold tuning.
- **Heuristic:** `ı İ ğ Ğ ş Ş` are strong signals; `ç ö ü Ç Ö Ü` are weak (also German/French). Turkish stopwords are matched per word after `toLocaleLowerCase('tr')`; the character test runs on the raw string.
- **English proper-name exception:** if exactly one word has a strong character, there are ≥ 2 English stopwords and no Turkish stopwords, the strong-character contribution drops below the threshold ("Even Erdoğan knows: this isn't…" → not Turkish).
- **Edge cases:** empty / null / non-string → `0`. Clipped titles are processed normally. Emoji and punctuation don't affect the score.
- **Cache:** `Map` keyed by title, cleared at ~2000 entries.
- **Export:** `globalThis.YTRF = globalThis.YTRF || {}; YTRF.detect = { turkishScore, isTurkish };`. No ES modules, no `module.exports`.

### `chrome.storage` keys
| Key | Area | Type / default | Writer | Reader |
|---|---|---|---|---|
| `enabled` | `sync` | `boolean` / `true` | popup | content |
| `mode` | `sync` | `'hide' \| 'dim'` / `'hide'` | popup | content |
| `debug` | `sync` | `boolean` / `false` | manual (DevTools) | content |
| `hiddenCount` | `local` | `number` / `0` | content | popup |

- `hiddenCount` is the number of cards hidden on the **last active watch page**; reset on SPA navigation; writes are debounced ~500 ms. It uses `local` because `sync` has a per-minute write quota. With several YouTube tabs open the last writer wins (accepted pilot limitation).
- Defaults are supplied on every read via `chrome.storage.sync.get({enabled: true, mode: 'hide', debug: false})`; nothing is written on install.
- Changes are observed live through `chrome.storage.onChanged`.
- In `dim` mode, dimmed cards also count toward `hiddenCount`.

### Auto-translated titles (oEmbed)
- YouTube may auto-translate Turkish titles into the UI language, both on cards and in the watch page `h1`. There is **no** DOM marker for this (verified 2026-10-12).
- If the shown title isn't Turkish, `content.js` calls same-origin `GET /oembed?format=json&url=…watch?v=<id>` to get the **original title** and checks it with `isTurkish`. No extra permission is needed.
- Cache: videoId → title `Map` (max 2000). At most 3 requests in flight. On failure `''` is cached and not retried.
- The context rule uses the same path; no decision is made until the current video's original title has arrived.
- `selectors.js` exports: `cardTitle`, `cardChannel`, `cardVideoId`, `currentVideoId`, `watchTitle`.

### File ownership
| File | Owner |
|---|---|
| `CLAUDE.md`, `README.md`, `manifest.json` | Main session only |
| `src/selectors.js`, `src/content.js`, `src/content.css` | Main session |
| `src/detect.js`, `tests/detect.test.html` | Agent A |
| `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js` | Agent B |

Agent rules: write only your own files; if another file needs a change, don't make it, report it. No commits. Stop after 2 failed attempts on the same error and report. Finish with a 3-line report: what was done, how it was tested, what's still open.

## Task cards
| Card | Work | Model | Status / dependency |
|---|---|---|---|
| K0 | Approach evaluation, plan, CLAUDE.md | Opus | ✅ Done |
| K1 | `manifest.json` (storage permission, popup, content-script order) | Opus (main) | ✅ Done |
| K2 | `selectors.js`: `yt-lockup-view-model` (+ legacy `ytd-compact-video-renderer`), full title from `h3[title]`, channel, video ids, watch title | Opus (main) | ✅ Done · verified 2026-10-12 |
| K3 | `detect.js`: character heuristic + stopwords + cache + English proper-name exception; `tests/detect.test.html` | Sonnet (Agent A) | ✅ Done · all tests pass (headless Chrome) |
| K4 | `content.js`: observer, debounce, recycled nodes, SPA navigation, debug mode | Opus (main) | ✅ Done |
| K5 | Context rule: Turkish suggestions stay when the current video is Turkish | Opus (main) | ✅ Done |
| K5b | Auto-translated Turkish titles: original title via oEmbed (cards + context) | Opus (main) | ✅ Done · verified by user on a translated card |
| K6 | Popup per the storage contract | Sonnet (Agent B) | ✅ Done |
| K7 | Real-world use and threshold tuning (1–2 days) | User + Sonnet | **Next** |
| K8 | (Optional) A experiment: measure gl/IP effect | Opus decides | Only if B is insufficient · STOP-5 |

## STOP points (user approval required)
- **STOP-1:** ✅ (2026-10-12) Extension loaded unpacked, log visible in the YouTube tab console.
- **STOP-2:** ✅ (2026-10-12) Selectors verified on a real page; user confirmed hiding, context rule, counter and the translated-title case.
- **STOP-3:** Before adding **any permission** beyond `storage`, MAIN-world injection, request interception, or `declarativeNetRequest`.
- **STOP-4:** After K7: review false positives / negatives in debug mode before changing thresholds or defaults.
- **STOP-5:** Before starting K8 (approach A).
- **STOP-6:** Before widening the scope (homepage, Shorts, search, end screen).

## Working rules
- **Stop after 2 failed attempts on the same error.** Summarize what was tried, what was observed, and the hypotheses, and **suggest handing back to Opus**. No blind third attempt.
- Selectors live only in `selectors.js`; no hard-coded selectors elsewhere.
- No framework, npm, or build step. Plain JS (ES2020+), targeting current Chrome.
- Never remove elements; only add/remove classes.
- Logs use the `[ytrf]` prefix; verbose logs are gated by the `debug` setting.
- Everything in the repo is written in English (comments, docs, UI strings, logs). Turkish appears only as data (stopwords, test inputs).

## Testing
1. Open `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → select this folder (the root containing `manifest.json`).
3. After code changes, click **↻ (reload)** on the extension card, then **reload the YouTube tab** (content scripts are only re-injected on page load).
4. Logs: YouTube tab → DevTools → Console. Popup logs: right-click the popup → Inspect.
5. Errors: `chrome://extensions` → extension card → **Errors**.
6. Debug mode: right-click the popup → Inspect → Console → `chrome.storage.sync.set({debug: true})` (`false` to turn off).
7. `detect.js` unit tests: open `tests/detect.test.html` in Chrome and check the green summary bar. From the command line (no Node needed):
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --user-data-dir=<temp dir> --dump-dom file:///D:/development/yt_region_filter/tests/detect.test.html` → look for `ALL PASSED`.

**Known limitations (watch during K7):**
- Turkish titles with no special characters and only one stopword (e.g. "bugün hava çok güzel" = 0.35) slip through.
- Short English titles with a Turkish name and fewer than 2 English stopwords ("Erdoğan meets Biden in Washington") still count as Turkish.
- A translated Turkish card can be briefly visible until its oEmbed response arrives.
- All-ASCII uppercase Turkish ("ILK KEZ") doesn't match the stopword list.

**Scenario checklist:**
- [x] Watching an English video: Turkish suggestions in the sidebar are hidden.
- [x] Watching a Turkish video: Turkish suggestions are shown (context rule).
- [x] Scrolling the sidebar: newly loaded cards are filtered too.
- [x] Auto-translated Turkish titles are caught via oEmbed.
- [ ] Video-to-video (SPA) navigation updates the context; no stale decisions.
- [ ] Turning the filter off in the popup restores all cards.
- [x] Debug mode shows a score label on each card.
