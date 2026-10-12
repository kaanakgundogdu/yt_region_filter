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

  function scan() {
    const sidebar = document.querySelector(sel.S.sidebar);
    if (location.pathname !== '/watch' || !sidebar || !settings.enabled) {
      if (sidebar && !settings.enabled) clearAll(sidebar);
      return;
    }

    // Context rule: if the current video is Turkish (even if translated), Turkish suggestions stay.
    // Wait for the original title before deciding, to avoid hiding and then un-hiding.
    const ctx = judge(sel.watchTitle(), sel.currentVideoId());
    if (ctx.src === '…') return;
    const contextTr = ctx.tr;
    let count = 0;

    for (const card of sidebar.querySelectorAll(sel.S.card)) {
      // YouTube recycles nodes, so re-apply the decision on every scan (results are cached).
      const { tr, score, src } = judge(sel.cardTitle(card), sel.cardVideoId(card));
      const filter = tr && !contextTr;

      card.classList.remove(...CLASSES);
      if (filter) {
        card.classList.add(settings.mode === 'dim' ? 'ytrf-dim' : 'ytrf-hidden');
        count++;
      }
      if (settings.debug) {
        card.classList.add('ytrf-debug');
        card.dataset.ytrfTr = tr ? '1' : '0';
        card.dataset.ytrfLabel = `${score.toFixed(2)}${src}${filter ? ' hidden' : ''}${contextTr ? ' (context TR)' : ''}`;
      }
    }

    if (count !== lastCount) {
      lastCount = count;
      log('hidden:', count, 'context TR:', contextTr);
      clearTimeout(countTimer);
      countTimer = setTimeout(() => chrome.storage.local.set({ hiddenCount: count }), 500);
    }
  }

  function clearAll(sidebar) {
    clearTimeout(countTimer);
    for (const card of sidebar.querySelectorAll(sel.S.card)) card.classList.remove(...CLASSES);
    if (lastCount !== 0) {
      lastCount = 0;
      chrome.storage.local.set({ hiddenCount: 0 });
    }
  }

  function schedule() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 100);
  }

  // Infinite scroll, lazy loading, and title changes on recycled nodes.
  // Only the 'title' attribute is watched, so our own class/data changes don't cause a loop.
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['title'],
  });

  // SPA navigation: reset the counter and recompute the context.
  document.addEventListener('yt-navigate-finish', () => {
    lastCount = -1;
    schedule();
  });

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
