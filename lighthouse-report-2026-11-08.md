# Stream HD / Movie Box Edition Lighthouse Audit

**Audit date:** 2026-11-08  
**Production URL:** https://stream.leetec.online/?lighthouse=20261108  
**Deployment under test:** Movie Box Edition startup fix (`d87dd8a`)

## Category scores

| Category | Score |
|---|---:|
| Performance | 75/100 |
| Accessibility | 92/100 |
| Best Practices | 96/100 |
| SEO | 100/100 |
| Agentic Browsing | 100/100 |

## PWA and installability

The production browser confirmed the key installability prerequisites:

- Secure context: **pass** (`window.isSecureContext === true`)
- Manifest: **pass**, HTTP 200, valid JSON, `display: standalone`, `scope: /`, and `start_url: /`
- Icons: **pass** for `/icon-192.png`, `/icon-512.png`, and `/icon.svg`
- Service worker: **pass**, registered at `/sw.js`, activated, and scoped to `/`
- Service-worker header: **pass**, `Service-Worker-Allowed: /`
- Offline shell: service worker caches `/`, `/index.html`, the manifest, and the application icons; navigation falls back to the cached `/index.html`
- Splash state after startup: **pass**; the fixed production page removes the splash after initialization

The installed Lighthouse version does not expose the former standalone PWA category, so installability was verified directly through the browser APIs and network responses instead of treating a missing Lighthouse category as a failure.

## Important findings

### Performance

The overall Performance score is **75**. The main opportunities are:

1. First Contentful Paint: **3.6 s**
2. Largest Contentful Paint: **3.6 s**
3. Speed Index: **8.1 s**
4. Main-thread work: **5.2 s**, with approximately 2.84 s spent in style/layout
5. Render-blocking resources include Google Fonts, HLS.js, and Artplayer
6. HLS.js contributes approximately 121 KB of unused JavaScript on the initial route
7. The root document response was approximately 680 ms in this run
8. The John Wick poster is served at 500x750 while displayed at approximately 281x422, with an estimated 33 KB opportunity

The large initial script and eager player-library loading are the primary optimization opportunities. These do not prevent installation or playback.

### Accessibility

Accessibility scored **92**. Lighthouse identified:

- WhatsApp green buttons need darker text or a darker background for WCAG contrast.
- Orange Movie API button text is too close to the gold primary background.
- Library cards expose an `aria-label` that does not fully include the visible badge and title text.
- The viewport currently prevents user scaling (`user-scalable=no` / restrictive maximum scale).

### Best practices

Best Practices scored **96**. The only runtime console error reported was a 404 for:

`https://i.ytimg.com/vi/jfKfPfyJRdk/maxresdefault.jpg`

The card already has an image error fallback, so this does not block the application, but the default LOFI artwork URL should be changed to `hqdefault.jpg` or another known-valid thumbnail to remove the console error.

The back/forward-cache warning is caused by the production `Cache-Control: no-store` policy and is reported as non-actionable for this deployment configuration.

### SEO

SEO scored **100**. Titles, metadata, crawl files, and the public page structure passed the audit.

## Verification conclusion

The Movie Box Edition startup fix is working in production. The page reaches the normal application shell, initializes the library, registers the service worker, and removes the splash screen. The PWA is installable based on the verified secure-context, manifest, icon, service-worker, scope, and standalone-display signals.

The remaining Lighthouse findings are optimization and accessibility improvements, not startup or installability blockers.
