# Stream HD Cross-Browser Playback Test

**Date:** 2026-11-10  
**Production URL:** https://stream.leetec.online/?browser-test=a053136  
**Published commit:** `a053136`

## Test coverage

| Browser | Execution | Result |
|---|---|---|
| Chromium/Chrome-compatible | Live production browser | Passed |
| Firefox | Static branch and capability review | Code path verified; Firefox binary unavailable in the test environment |
| Safari/WebKit | Static branch and capability review | Code path verified; Safari is unavailable in the Linux test environment |

The available browser environment contains Chromium only. Safari cannot be installed or executed on this Linux sandbox, so no claim of real Safari execution is made. Firefox was also not installed. The Safari and Firefox results below are therefore implementation-level verification, not device-browser certification.

## Playback matrix

### Safari / iOS / WebKit

The HLS branch checks:

```js
video.canPlayType('application/vnd.apple.mpegurl')
```

When supported, the app assigns the HLS URL directly to the native video element and does not load HLS.js. This is the correct native-HLS path for Safari, iPhone/iPad, and Apple TV browsers.

### Chrome and Firefox

When native HLS is not available, the app dynamically loads the pinned HLS.js 1.6.13 library, creates an HLS instance, attaches it to the video element, and includes network/media recovery handling. If HLS.js cannot load or is unsupported, the UI exposes a retryable playback error rather than an infinite loading state.

### Local video / Artplayer

Artplayer 5.4.0 is loaded only when local video playback is selected. If it fails to load, the app falls back to the native video player. The initial page does not download Artplayer.

## Live Chromium results

- Native MP4 branch returned successfully.
- Test source reached `readyState: 4`.
- The video status correctly displayed `Video is ready. Tap Play to start playback.` when autoplay was blocked by browser policy.
- Native HLS capability reported `maybe` in Chromium, while the HLS.js fallback loader remained available.
- Both lazy loader functions were present in the production bundle.

## YouTube bot / verification handling

The app does **not** attempt to bypass YouTube bot checks, sign-in requirements, DRM, cookies, or verification flows.

Compliant behavior now uses:

- `youtube-nocookie.com/embed/...` privacy-enhanced embeds.
- Explicit `origin` and standard YouTube player parameters.
- Official YouTube Data API search results where configured.
- A retryable embed action.
- An `OPEN YOUTUBE` fallback to the official `youtube.com/watch?v=...` URL when an embed fails, stalls, or appears verification-gated.

The live production helper test confirmed that generated embed URLs use `youtube-nocookie.com` and official fallback URLs use `www.youtube.com/watch`.

## Conclusion

The production implementation has distinct native and library-backed playback paths, bounded fallback behavior, and compliant YouTube handling. Chromium playback was exercised live. Firefox and Safari require testing on their native environments for final certification, but their intended code branches are present and validated statically.
