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

    // Player suggestion tiles (verified 2026-10-12), pre-rendered and recycled (href/text change in place):
    //  - .ytp-fullscreen-grid: the suggestions grid opened while watching in fullscreen and shown at
    //    the end of the video (modern tiles, CSS grid, so hidden tiles reflow);
    //  - .ytp-endscreen-content: legacy end-screen wall (absolutely positioned, hidden tiles leave gaps).
    endscreenStill: '#movie_player .ytp-modern-videowall-still, #movie_player .ytp-videowall-still',

    // Autoplay "Up next" countdown overlay and its cancel button.
    upnext: '#movie_player .ytp-autonav-endscreen-upnext-container',
    upnextCancel: '#movie_player .ytp-autonav-endscreen-upnext-cancel-button',
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

  function idFromHref(el) {
    const href = el && el.getAttribute('href');
    const m = href && href.match(/[?&]v=([\w-]{11})/);
    return m ? m[1] : '';
  }

  // End screen tile: the <a> itself carries the watch link.
  function stillTitle(still) {
    const el = still.querySelector('.ytp-modern-videowall-still-info-title, .ytp-videowall-still-info-title');
    return el ? el.textContent.trim() : '';
  }

  function stillVideoId(still) {
    return idFromHref(still);
  }

  function upnextTitle(upnext) {
    const el = upnext.querySelector('.ytp-autonav-endscreen-upnext-title');
    return el ? el.textContent.trim() : '';
  }

  function upnextVideoId(upnext) {
    return idFromHref(upnext.querySelector('a.ytp-autonav-endscreen-link-container'));
  }

  globalThis.YTRF = globalThis.YTRF || {};
  YTRF.sel = {
    S, cardTitle, cardChannel, cardVideoId,
    stillTitle, stillVideoId, upnextTitle, upnextVideoId,
  };
})();
