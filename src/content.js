// Scans the watch-page sidebar and hides/dims off-context Turkish recommendations.
// Dependencies (manifest load order): YTRF.sel (selectors.js), YTRF.detect (detect.js).
(() => {
  'use strict';

  const { sel, detect } = globalThis.YTRF || {};
  if (!sel || !detect) {
    console.error('[ytrf] selectors.js or detect.js not loaded');
    return;
  }

  const DEFAULTS = { enabled: true, mode: 'hide', debug: false };
  const CLASSES = ['ytrf-hidden', 'ytrf-dim', 'ytrf-debug'];

  let settings = { ...DEFAULTS };
  let lastCount = -1;
  let scanTimer = 0;
  let countTimer = 0;

  const log = (...a) => settings.debug && console.log('[ytrf]', ...a);

  // When the extension is reloaded or updated, the copy already injected into open tabs keeps
  // running but loses its extension APIs (chrome.storage becomes undefined). Detect that and shut
  // this copy down; the tab gets a fresh one on its next reload.
  let observer = null;
  let dead = false;
  const alive = () => !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);

  function shutdown() {
    if (dead) return;
    dead = true;
    clearTimeout(scanTimer);
    clearTimeout(countTimer);
    if (observer) observer.disconnect();
    document.removeEventListener('ended', onEnded, true);
    document.removeEventListener('yt-navigate-finish', onNavigate);
    console.info('[ytrf] extension was reloaded; reload this tab to re-enable filtering');
  }

  function saveCount(n) {
    if (!alive()) return shutdown();
    chrome.storage.local.set({ hiddenCount: n });
  }

  // --- Original title (oEmbed) ---
  // YouTube may auto-translate Turkish titles and leaves no marker in the DOM.
  // The same-origin /oembed endpoint returns the original title; no extra permission needed.
  const ORIGINAL_CACHE_LIMIT = 2000;
  const MAX_INFLIGHT = 3;
  const originals = new Map(); // videoId -> string ('' = unavailable); missing key = not requested yet
  const queue = [];
  const queued = new Set();
  let inflight = 0;

  // Returns the cached title, or enqueues a fetch and returns undefined (a rescan runs when it arrives).
  function originalTitle(id) {
    if (!id) return '';
    if (originals.has(id)) return originals.get(id);
    if (!queued.has(id)) {
      queued.add(id);
      queue.push(id);
      pump();
    }
    return undefined;
  }

  function pump() {
    while (inflight < MAX_INFLIGHT && queue.length) {
      const id = queue.shift();
      inflight++;
      const url = '/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id);
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && typeof j.title === 'string' ? j.title : ''))
        .catch(() => '')
        .then((title) => {
          if (originals.size >= ORIGINAL_CACHE_LIMIT) originals.clear();
          originals.set(id, title);
          queued.delete(id);
          inflight--;
          pump();
          schedule();
        });
    }
  }

  // If the displayed title isn't Turkish, also check the original (untranslated) title.
  function judge(shownTitle, id) {
    const shown = detect.turkishScore(shownTitle);
    if (detect.isTurkish(shownTitle)) return { tr: true, score: shown, src: '' };
    const orig = originalTitle(id);
    if (orig === undefined) return { tr: false, score: shown, src: '…' };
    if (orig && orig !== shownTitle && detect.isTurkish(orig)) {
      return { tr: true, score: detect.turkishScore(orig), src: ' translated' };
    }
    return { tr: false, score: shown, src: '' };
  }

  // Every element we filter: sidebar cards and end-screen tiles, with how to read their title/id.
  function targets() {
    const out = [];
    const sidebar = document.querySelector(sel.S.sidebar);
    if (sidebar) {
      for (const el of sidebar.querySelectorAll(sel.S.card)) out.push([el, sel.cardTitle(el), sel.cardVideoId(el)]);
    }
    for (const el of document.querySelectorAll(sel.S.endscreenStill)) {
      out.push([el, sel.stillTitle(el), sel.stillVideoId(el)]);
    }
    return out;
  }

  function scan() {
    if (location.pathname !== '/watch') return;
    if (!settings.enabled) {
      clearAll();
      return;
    }

    // Context rule: if the current video is Turkish (even if translated), Turkish suggestions stay.
    // Wait for the original title before deciding, to avoid hiding and then un-hiding.
    const ctx = judge(sel.watchTitle(), sel.currentVideoId());
    if (ctx.src === '…') return;
    const contextTr = ctx.tr;
    let count = 0;

    for (const [el, title, id] of targets()) {
      // YouTube recycles nodes, so re-apply the decision on every scan (results are cached).
      const { tr, score, src } = judge(title, id);
      const filter = tr && !contextTr;

      el.classList.remove(...CLASSES);
      if (filter) {
        el.classList.add(settings.mode === 'dim' ? 'ytrf-dim' : 'ytrf-hidden');
        count++;
      }
      if (settings.debug) {
        el.classList.add('ytrf-debug');
        el.dataset.ytrfTr = tr ? '1' : '0';
        el.dataset.ytrfLabel = `${score.toFixed(2)}${src}${filter ? ' hidden' : ''}${contextTr ? ' (context TR)' : ''}`;
      }
    }

    checkAutoplay(contextTr);

    if (count !== lastCount) {
      lastCount = count;
      log('hidden:', count, 'context TR:', contextTr);
      clearTimeout(countTimer);
      countTimer = setTimeout(() => saveCount(count), 500);
    }
  }

  // Hiding the "Up next" overlay wouldn't stop autoplay, so cancel the countdown instead.
  // The overlay is pre-rendered while the video plays; judging it early warms the oEmbed cache,
  // but we only click Cancel once it is actually visible (i.e. the countdown is running).
  let cancelledFor = '';
  function checkAutoplay(contextTr) {
    const upnext = document.querySelector(sel.S.upnext);
    if (!upnext) return;
    const id = sel.upnextVideoId(upnext);
    if (!id || id === cancelledFor) return;
    const { tr } = judge(sel.upnextTitle(upnext), id);
    if (!tr || contextTr || upnext.getClientRects().length === 0) return;
    const cancel = document.querySelector(sel.S.upnextCancel);
    if (!cancel) return;
    cancel.click();
    cancelledFor = id;
    log('autoplay cancelled:', sel.upnextTitle(upnext));
  }

  function clearAll() {
    clearTimeout(countTimer);
    for (const [el] of targets()) el.classList.remove(...CLASSES);
    if (lastCount !== 0) {
      lastCount = 0;
      saveCount(0);
    }
  }

  function schedule() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => (alive() ? scan() : shutdown()), 100);
  }

  // Infinite scroll, lazy loading, and changes on recycled nodes. Only 'title' (sidebar cards)
  // and 'href' (end-screen tiles) are watched, so our own class/data changes don't cause a loop.
  observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['title', 'href'],
  });

  // The end screen and autoplay countdown appear when the video ends; media events don't
  // bubble, so listen in the capture phase. Rescan again shortly after, once the overlay is shown.
  function onEnded() {
    schedule();
    setTimeout(schedule, 600);
  }
  document.addEventListener('ended', onEnded, true);

  // SPA navigation: reset the counter and recompute the context.
  function onNavigate() {
    lastCount = -1;
    schedule();
  }
  document.addEventListener('yt-navigate-finish', onNavigate);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k of Object.keys(DEFAULTS)) {
      if (changes[k]) settings[k] = changes[k].newValue ?? DEFAULTS[k];
    }
    lastCount = -1;
    schedule();
  });

  chrome.storage.sync.get(DEFAULTS).then((s) => {
    settings = s;
    console.log('[ytrf] loaded', settings);
    schedule();
  });
})();
