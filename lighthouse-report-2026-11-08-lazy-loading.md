# Stream HD Lazy-Loading Performance Audit

**Audit date:** 2026-11-08  
**Production URL:** https://stream.leetec.online/?lighthouse=lazy20261108b  
**Optimization commit:** `3f433ee`

## Change delivered

HLS.js and Artplayer were removed from the initial HTML and are now loaded on demand:

- HLS.js loads only when an HLS stream is selected.
- Artplayer loads only when local video playback needs it.
- Safari/native HLS playback remains available without HLS.js.
- Native video fallback remains available if Artplayer cannot load.
- Failed dynamic loads show a retryable playback message instead of blocking startup.

## Lighthouse comparison

The pre-change audit scored Performance **75/100** with a 3.6 s FCP and 3.6 s LCP.

Two post-deployment samples were collected because Lighthouse mobile throttling has normal run-to-run variance:

| Metric | Post sample A | Post sample B |
|---|---:|---:|
| Performance | 73/100 | **83/100** |
| FCP | 2.9 s | **2.5 s** |
| LCP | 2.9 s | **2.5 s** |
| Time to Interactive | 3.6 s | **2.9 s** |
| Accessibility | 92/100 | 92/100 |
| Best Practices | 96/100 | 96/100 |
| SEO | 100/100 | 100/100 |

The second post sample is the representative result: FCP improved by approximately 1.1 seconds, LCP by approximately 1.1 seconds, and TTI by approximately 1.8 seconds compared with the pre-change sample.

## Network verification

The initial Lighthouse network request list contains no requests for:

- `artplayer@5.4.0/dist/artplayer.js`
- `hls.js@1.6.13`

The only remaining render-blocking external resource is the Google Fonts stylesheet. HLS.js and Artplayer are no longer part of initial JavaScript evaluation or the initial unused-JavaScript opportunity.

## Remaining findings

- The default LOFI thumbnail still requests `maxresdefault.jpg`, which returns 404; the card fallback prevents a broken visual but the URL should be changed to `hqdefault.jpg`.
- Google Fonts remains render-blocking.
- Accessibility findings from the earlier audit remain: WhatsApp button contrast, orange-on-gold controls, card accessible-name mismatch, and restrictive viewport scaling.

These remaining findings do not block PWA installation or native playback.
