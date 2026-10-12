// Popup: reads/writes settings and shows the hidden-card counter live.
// Contract: enabled/mode -> storage.sync (popup writes), hiddenCount -> storage.local (read-only).
(() => {
  'use strict';

  const DEFAULTS = { enabled: true, mode: 'hide' };

  const elEnabled = document.getElementById('enabled');
  const elGroup = document.getElementById('modeGroup');
  const elCount = document.getElementById('count');
  const radios = Array.from(document.querySelectorAll('input[name="mode"]'));

  const hasStorage = typeof chrome !== 'undefined' && chrome.storage &&
    chrome.storage.sync && chrome.storage.local;

  function renderSettings({ enabled, mode }) {
    elEnabled.checked = !!enabled;
    elGroup.disabled = !enabled;
    for (const r of radios) r.checked = r.value === mode;
  }

  function renderCount(n) {
    elCount.textContent = String(Number.isFinite(n) ? n : 0);
  }

  // Current UI state (kept because onChanged delivers partial changes)
  const state = { ...DEFAULTS };

  if (!hasStorage) {
    console.warn('[ytrf] chrome.storage unavailable; showing defaults.');
    renderSettings(state);
    renderCount(0);
    return;
  }

  chrome.storage.sync.get(DEFAULTS).then((s) => {
    state.enabled = s.enabled;
    state.mode = s.mode === 'dim' ? 'dim' : 'hide';
    renderSettings(state);
  });
  chrome.storage.local.get({ hiddenCount: 0 }).then((s) => renderCount(s.hiddenCount));

  // User interaction: only enabled and mode are written
  elEnabled.addEventListener('change', () => {
    state.enabled = elEnabled.checked;
    elGroup.disabled = !state.enabled;
    chrome.storage.sync.set({ enabled: state.enabled });
  });
  for (const r of radios) {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      state.mode = r.value;
      chrome.storage.sync.set({ mode: state.mode });
    });
  }

  // Live updates (settings changed elsewhere, and the counter)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      if (changes.enabled) state.enabled = changes.enabled.newValue !== undefined ? changes.enabled.newValue : DEFAULTS.enabled;
      if (changes.mode) state.mode = changes.mode.newValue === 'dim' ? 'dim' : 'hide';
      if (changes.enabled || changes.mode) renderSettings(state);
    } else if (areaName === 'local' && changes.hiddenCount) {
      const v = changes.hiddenCount.newValue;
      renderCount(typeof v === 'number' ? v : 0);
    }
  });
})();
