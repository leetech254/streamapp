# Mobile Performance and YouTube Fallback Review

**Date:** 2026-11-12  
**Production URL:** https://stream.leetec.online/?perf=mobile-ytnocookie-20261112  
**Latest fallback commit:** `4a5c661`

## Simulated mobile Lighthouse result

| Category | Score |
|---|---:|
| Performance | 61/100 |
| Accessibility | 92/100 |
| Best Practices | 96/100 |
| SEO | 100/100 |

| Metric | Result |
|---|---:|
| First Contentful Paint | 2.2 s |
| Largest Contentful Paint | 2.2 s |
| Speed Index | 6.7 s |
| Time to Interactive | 5.5 s |
| Total Blocking Time | 2,910 ms |
| Cumulative Layout Shift | 0 |
| Root document response | 240 ms |

## YouTube and lazy-loader impact

The initial production request waterfall contained no requests for:

- `youtube-nocookie.com`
- `hls.js@1.6.13`
- `artplayer@5.4.0`

The live browser also reported no YouTube, HLS.js, or Artplayer performance entries on initial load. This confirms that privacy-enhanced YouTube embeds and the deferred playback libraries do not add initial network or render-blocking cost.

YouTube no-cookie embeds are requested only after a playback action. HLS.js and Artplayer remain deferred until their respective playback paths are selected.

## Main performance bottlenecks

The current mobile score is primarily affected by the app shell and visual layout, not YouTube:

- Main-thread work: approximately 9.4 s, dominated by style/layout at approximately 7.8 s.
- The full single-page HTML/app bundle has approximately 39 KiB of unused JavaScript under the mobile trace.
- Google Fonts is the only render-blocking external request, with an estimated 620 ms opportunity.
- The initial document is approximately 64.6 KiB transferred and about 280 KiB decoded.
- The YouTube thumbnail fallback still logs a 404 for `maxresdefault.jpg`; replacing it with `hqdefault.jpg` would remove that console error.

## API outage fallback delivered

When `/api/youtube-search` is unavailable, rate-limited, or missing configuration, the YouTube search UI now:

1. Explains that the Data API is unavailable.
2. Provides an official `OPEN OFFICIAL YOUTUBE SEARCH` link.
3. Preserves the no-cookie embed path for any video the user selects from official YouTube.
4. Avoids indefinite loading and does not attempt to bypass YouTube verification or bot protections.

The live fallback test produced:

- Heading: `YouTube search is temporarily unavailable`
- Official search URL: `https://www.youtube.com/results?search_query=Kenya%20official%20videos`
- Guidance that selected results can still play through the privacy-enhanced no-cookie embed.

## Conclusion

The YouTube no-cookie integration and lazy loaders have no measurable initial-load cost in the simulated mobile request waterfall. The largest remaining performance opportunity is reducing layout work and deferring or self-hosting the Google Fonts stylesheet, followed by reducing the single-page application bundle and fixing the invalid LOFI thumbnail URL.
