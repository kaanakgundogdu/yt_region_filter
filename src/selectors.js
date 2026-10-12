// All YouTube DOM selectors live here. If YouTube changes its DOM, only this file needs fixing.
// Verified on the watch page on 2026-10-12: sidebar cards are yt-lockup-view-model.
// YouTube may auto-translate titles; cards carry NO "translated" marker (2026-10-12).
(() => {
  'use strict';

  const S = {
    // Sidebar ("up next" list). On narrow layouts it moves below the video; same element.
    sidebar: 'ytd-watch-next-secondary-results-renderer',

    // Cards: new lockup layout + legacy renderer (fallback).
    card: 'yt-lockup-view-model, ytd-compact-video-renderer',

    // Title of the video being watched.
    watchTitle: 'ytd-watch-metadata h1 yt-formatted-string, ytd-watch-metadata h1',
  };

  // Full title: the title attribute holds the untruncated text (the visible text is clipped with "…").
  function cardTitle(card) {
    const el =
      card.querySelector('h3[title]') ||           // new layout
      card.querySelector('#video-title[title]') ||  // legacy layout
      card.querySelector('#video-title');
    if (!el) return '';
    return (el.getAttribute('title') || el.textContent || '').trim();
  }

  // Channel name (for debug labels and a possible future allowlist).
  function cardChannel(card) {
    const el =
      card.querySelector('.ytContentMetadataViewModelMetadataRow span') ||
      card.querySelector('ytd-channel-name #text');
    return el ? el.textContent.trim() : '';
  }

  // Video id: the host div's "content-id-XXXX" class in the new layout, otherwise the watch link.
  function cardVideoId(card) {
    const host = card.querySelector('[class*="content-id-"]');
    const m = host && host.className.match(/content-id-([\w-]{11})/);
    if (m) return m[1];
    const a = card.querySelector('a[href*="/watch?v="]');
    const h = a && a.getAttribute('href').match(/[?&]v=([\w-]{11})/);
    return h ? h[1] : '';
  }

  function currentVideoId() {
    return new URLSearchParams(location.search).get('v') || '';
  }

  // Note: the h1 shows the auto-translated title; content.js fetches the original via oEmbed.
  function watchTitle() {
    const el = document.querySelector(S.watchTitle);
    if (!el) return '';
    return (el.getAttribute('title') || el.textContent || '').trim();
  }

  globalThis.YTRF = globalThis.YTRF || {};
  YTRF.sel = { S, cardTitle, cardChannel, cardVideoId, currentVideoId, watchTitle };
})();
