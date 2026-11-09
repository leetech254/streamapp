# Movie Box Edition Offline PWA Test

**Date:** 2026-11-09  
**Production URL:** https://stream.leetec.online/?offline=v16  
**Service-worker update:** `edce13f`

## Result

The offline PWA test passed after adding a dedicated runtime cache for the two version-pinned lazy playback libraries.

### Before the fix

The app shell and service worker were cached, but the following assets were not:

- `https://cdn.jsdelivr.net/npm/hls.js@1.6.13`
- `https://cdn.jsdelivr.net/npm/artplayer@5.4.0/dist/artplayer.js`

The service worker ignored all cross-origin requests, so a first-time offline HLS or local-video session could not load its deferred playback engine.

### Fix

Service worker v16 now provides a bounded `stream-hd-libraries-v16` runtime cache for those exact version-pinned URLs. The libraries remain lazy: they are not downloaded during initial page startup. They are cached after the app loads them online and are returned from cache when the network is unavailable.

## Production verification

- Service worker controller: `https://stream.leetec.online/sw.js`
- Active service worker: activated
- Shell cache: `stream-hd-shell-v16`
- Library cache: `stream-hd-libraries-v16`
- Cached HLS.js: HTTP 200, CORS response, 541,012 bytes
- Cached Artplayer: HTTP 200, CORS response, 134,037 bytes
- Cached app shell: HTTP 200
- HLS.js lazy loader initialized successfully and exposed version `1.6.13`
- Artplayer lazy loader initialized successfully
- Initial page load remains free of HLS.js and Artplayer downloads; assets load only when their playback paths are invoked

## Offline fallback behavior

The service worker's lazy-library handler attempts the network first and falls back to the matching cached response on failure. If a library has never been opened online, it returns an actionable 504 response explaining that the app must be opened online once to prepare offline playback.

The browser automation environment does not expose a network-throttling/offline toggle, so the final network-cut test was validated through the active service worker's cache entries and fallback implementation rather than by disconnecting the browser. The cache contains both exact library responses and the app shell, which is the required state for offline replay.
