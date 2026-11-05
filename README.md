# Stream HD Media Player

A responsive single-page media player for sources that you own or are authorized to play. It is a static site deployable to Vercel.

## Features

- Direct audio, video, HLS (`.m3u8`), and YouTube links; local audio/video files
- TMDB movie/series metadata and search
- Installable PWA with offline shell, subtitle, HLS, and bounded media caching
- Phone/tablet responsive layout, keyboard/TV remote navigation, and Picture-in-Picture where supported
- Browser-local library backup/import and channel management

## Deploy

Deploy the repository root to Vercel. Keep `index.html`, `api/`, `vercel.json`, `manifest.json`, `sw.js`, and `icon.svg` at the root.

### Offline caching

The service worker keeps separate versioned caches for the app shell, subtitles, and media. It uses network-first behavior for subtitles so fresh language tracks are preferred, then falls back to a cached WebVTT/SRT track when offline. Complete audio/video responses, HLS manifests, and common HLS segments can be cached for offline playback; cached complete media is replayed as byte ranges when the browser requests `Range` responses. Partial `206` network responses are not cached because an individual range is not a complete offline asset.

Media caching is bounded to 12 entries and skips responses advertised above 250 MB. Subtitle caching is bounded to 40 entries. These limits prevent a playlist or repeated streams from filling the device indefinitely. Offline playback still depends on the upstream server permitting the browser's request and on the media being fully cached before going offline; DRM, provider-authenticated streams, and uncached live streams cannot be made offline by the service worker.

## TMDB setup

In Vercel, open **Project Settings → Environment Variables**, add either `TMDB_ACCESS_TOKEN` with the TMDB v4 Bearer token or `TMDB_API_KEY` with the TMDB v3 API key for Production and Preview, then redeploy. `TMDB_ACCESS_TOKEN` takes priority when both are present. The `/api/tmdb/*` serverless proxy injects the credential on the server, so it is not sent to browsers. Search and title metadata become available after the redeploy; when TMDB is temporarily unavailable, trending falls back to saved catalog titles. The Admin key field remains an optional local-development fallback.

The TMDB key previously embedded in the public source should be revoked/rotated before deployment.

## Jamendo music setup

Create an application in the [Jamendo developer portal](https://devportal.jamendo.com/), then add its Client ID—the public catalog API credential—to Vercel as `JAMENDO_CLIENT_ID` for Production and Preview. `JAMENDO_API_KEY` is also accepted as a fallback for compatibility, but `JAMENDO_CLIENT_ID` takes precedence when both exist. Remove any stale or incorrect `JAMENDO_API_KEY` value, redeploy after saving the verified Client ID, and test **Find Music**. **Find Music** searches Jamendo automatically and plays the returned stream URL in the built-in audio player; each result includes artist attribution and a link back to Jamendo. Use the API only within Jamendo's license terms and request limits.

## YOCINEMA setup

Add `YOCINEMA_API_KEY` to Vercel Project Settings for Production and Preview, then redeploy. Stream HD calls YOCINEMA only through `/api/yocinema`; the key is never sent to the browser. The **YOCINEMA** search button uses the catalog API, obtains a short-lived stream token server-side, and plays the returned authorized stream through the native HTML5 video player. The interface language is English by default, and YOCINEMA starts in **English translated version** mode (`type=translated`) so users do not unexpectedly receive the provider's local-language original audio. **Original audio (provider language)** remains available as an explicit alternative through `type=original`. The provider must supply the translation; Stream HD does not fabricate or dub audio. Use YOCINEMA only for content and translations you are authorized to distribute.

## Watchmode where-to-watch setup

Add `WATCHMODE_API_KEY` to Vercel Project Settings for Production and Preview, then redeploy. Stream HD calls Watchmode only through `/api/watchmode`; the key is never sent to the browser. Movie and TV details use the existing TMDB ID to request regional sources and render official subscription, free, rental, purchase, or TV-provider links. On mobile, valid Android or iOS links are preferred when Watchmode provides them; otherwise the card opens the provider's web URL. Watchmode does not provide video playback, so these links open the authorized provider destination instead of attempting to proxy a copyrighted stream. Developer-plan usage requires Watchmode attribution and supplies web links; native app deeplinks depend on the Watchmode plan and source coverage.

If Watchmode is unavailable, returns an error, or returns no usable source links, the details view automatically falls back to TMDB's regional watch-provider endpoint. TMDB provider names are shown with the region's official web destination when available. If neither service supplies a destination, Stream HD displays a clear no-links state rather than attempting to guess or extract a stream URL.

## Official Kenya TV channel search

Add `YOUTUBE_API_KEY` to Vercel Project Settings for Production and Preview to enable **FIND KENYA TV** searches across official YouTube channels. The key remains server-side in `/api/youtube-search`; search results are channel IDs and playback always uses each channel's official live-stream embed, never a recorded video URL. The built-in Citizen TV, NTV Kenya, KTN News, K24 TV, KBC, TV47, and Maisha TV entries remain available when the YouTube API key is missing or quota is unavailable.

YouTube also powers the **YOUTUBE AUDIO** and **YOUTUBE VIDEOS** search buttons. Results are restricted to embeddable YouTube videos and play in the in-page official YouTube player; the app does not extract or download YouTube media. **FIND MUSIC** continues to use Jamendo for direct licensed audio playback, while **FREE ARCHIVE FILMS** continues to use Internet Archive public-domain embeds, so each provider is used for the media type it supports best.

## Add media and TV

Use the paste panel to play YouTube, audio, video, or HLS links in the embedded player. **Download** uses a browser-integrated blob download for Jamendo tracks and direct media sources that permit CORS; embedded video and live HLS streams remain playback-only. Jamendo tracks include artist attribution and a link back to their Jamendo page. Direct source URLs must be absolute HTTP(S) links and work only when supported by the browser, the stream's codecs, and its CORS policy. For catalog items, add the TMDB ID for metadata and add an authorized direct MP4, WebM, MOV, or HLS URL in the optional playback field to enable **PLAY FULL**. TMDB does not provide full movie or series files.

## Authorized Movie API integration

When you own or are authorized to use the Movie API, Stream HD exposes it through the serverless `/api/movieapi` proxy. The proxy keeps the upstream hostname in server code, validates the action/type/ID parameters, disables caching, and supports:

```text
/api/movieapi?action=search&keyword=Avatar&type=movie
/api/movieapi?action=catalog-search&keyword=Avatar&type=movie
/api/movieapi?action=stream&id=3737&type=movie
/api/movieapi?action=stream&subjectId=8906247916759695608&type=movie
/api/movieapi?action=media&subjectId=8906247916759695608&type=movie
/api/movieapi?action=stream&id=77&type=tv&season=1&episode=1
```

The player controls include **AUTHORIZED MOVIE API** and **AUTHORIZED SERIES API** search actions. Search now uses the provider's richer catalog endpoint first, preserving each result's `subjectId`, poster, release date, trailer, and subtitle metadata, then falls back to the legacy ShowBox search when needed. Modern results use the provider's BFF media proxy through `/api/movieapi?action=media&subjectId=...`; the proxy forwards HTTP Range requests, so seeking and native video playback work without exposing the upstream hostname in the page. Legacy ShowBox IDs still use the existing direct-stream route and its `/api/stream` fallback.

The proxy also exposes the provider's caption lookup through `action=captions` for future subtitle URL discovery. It validates large numeric subject IDs separately from legacy IDs, limits TV season/episode values, forwards only safe resolution and language options, preserves media response headers, and returns structured errors such as `UPSTREAM_ACCESS_BLOCKED` or `UPSTREAM_MEDIA_ERROR` with retry/fallback metadata instead of pretending playback succeeded. Before attaching a Movie API or series media URL to the native player, the browser performs a tiny same-origin Range preflight and requires a media content type; the UI reports `Loading` until the media element emits a real `playing` event. When full playback fails, the UI plays an official trailer when one is available and explains when the provider has blocked server playback. The provider must still authorize the source and make it available; a provider-side 403 cannot be bypassed by the app.

Movie and series details load the official TMDB Watch Providers list using the saved region, the browser region, and global fallbacks (`KE`, `US`, `GB`, `CA`, `AU`, `ZA`, and `NG`). The selector prioritizes free, free-with-ads, and subscription options; rent/buy options are shown only when no free or subscription match is available. If the preferred regions have no low-friction option, the best matching global region is selected and shown in the heading. Availability is supplied by TMDB/JustWatch. TMDB provider records do not include embeddable streams or DRM access; full in-site playback requires an authorized source or a provider SDK that explicitly permits embedding.

The **Kenya** library includes official live channels for Citizen TV, NTV Kenya, KTN News, K24 TV, KBC Channel 1, TV47 Kenya, and Maisha TV Kenya. Selecting a channel always uses the broadcaster's official YouTube live-channel embed, never a saved individual video ID; if that broadcaster is between live programmes, the player keeps the official channel entry available and shows a neutral feed-loading state rather than opening a recorded programme as live TV.

Use **FIND KENYA TV** to search these official Kenyan channels instantly by name (Citizen, NTV, KTN, K24, KBC, TV47, or Maisha). The local search does not depend on TMDB, so it remains available when the metadata API is offline. When a broadcaster has no active live programme, the app keeps the official channel entry available and shows a neutral feed-loading state instead of a broken-source error.

**FREE ARCHIVE FILMS** searches the Internet Archive’s Prelinger collection and opens the official Archive embed inside the player without an API key. YouTube trailers/clips use the official no-cookie embed. Vimeo and Watchmode require the account’s authorized API credentials and are not treated as anonymous free stream sources; TMDB/Watchmode links are availability links, not embeddable media.

The hybrid player loads TMDB title metadata, release date, overview, rating, and top cast through the TMDB proxy. The details view loads official YouTube trailer/clip keys from TMDB and plays them in the embedded YouTube player, embeds Internet Archive films through the official Archive player, and shows global TMDB Watch Provider cards with free/ad-supported options first. The footer includes the required notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.”

YouTube playback offers both the privacy-enhanced `youtube-nocookie.com` embed and an official `youtube.com` fallback in the source selector. YouTube may still require sign-in or an “I’m not a robot” check for a particular network, IP, video, or account; this is enforced by YouTube and cannot be bypassed by the app.

All recognized YouTube links and keys are normalized to the privacy-enhanced embed format with autoplay, related-video, inline, and iframe API parameters. Direct MP4, WebM, MOV, and HLS URLs use the native HTML5 video control; HLS uses hls.js when supported and falls back to the browser’s native HLS implementation. Internet Archive catalog items use the official `https://archive.org/embed/{archive_id}` player.

The player has a runtime **Server / Source Selector**. On this static Vercel app, runtime configuration is supplied through `window.STREAMHD_PLAYER_CONFIG` or the Admin panel’s **APPROVED PLAYER TEMPLATE** field (the equivalent of a client-exposed `.env.local` value). Supported placeholders are `{tmdb_id}`, `{type}`, `{season}`, `{episode}`, `{youtube_key}`, `{archive_id}`, and `{authorized_url}`. Only YouTube, Internet Archive, Vimeo, and approved direct media hosts are accepted; unapproved embed gateways are rejected. TV details load seasons and episodes from TMDB, update the active episode state, and automatically play an official YouTube episode clip when TMDB lists one.

Example runtime configuration, loaded before the app script:

```html
<script>
  window.STREAMHD_PLAYER_CONFIG = {
    primaryTemplate: 'https://www.youtube-nocookie.com/embed/{youtube_key}?autoplay=1&rel=0&playsinline=1',
    sources: [
      { id: 'youtube', label: 'Official YouTube', template: 'https://www.youtube-nocookie.com/embed/{youtube_key}?autoplay=1' },
      { id: 'archive', label: 'Internet Archive', template: 'https://archive.org/embed/{archive_id}' },
      { id: 'vimeo', label: 'Authorized Vimeo', template: 'https://player.vimeo.com/video/{tmdb_id}' }
    ]
  };
</script>
```

For Vercel, these variables are also supported through the serverless configuration endpoint. Add them under **Project Settings → Environment Variables**:

```text
NEXT_PUBLIC_PLAYER_GATEWAY_URL=https://www.youtube-nocookie.com/embed/{youtube_key}?autoplay=1&rel=0&playsinline=1
NEXT_PUBLIC_SERVER_2_URL=https://archive.org/embed/{archive_id}
NEXT_PUBLIC_SERVER_3_URL=https://player.vimeo.com/video/{tmdb_id}
```

An empty value is allowed. After saving or changing the variables, redeploy the project. The app requests `/api/player-config` at startup, detects each valid provider URL automatically, and adds it to the in-page source selector. These values are URLs, not secrets; do not place API keys in them.

If you own or are authorized to use another provider, add its exact hostname to a comma-separated allowlist; do not add a gateway you do not control or have permission to embed:

```text
NEXT_PUBLIC_ALLOWED_PLAYER_HOSTS=player.your-domain.com,cdn.your-domain.com
```

The extra variable is optional when the provider URL is already in one of the three server variables; those provider hosts are detected automatically. The Admin safety toggle must be enabled before custom provider hosts are displayed. When enabled, the app accepts any valid HTTP(S) provider domain from these templates; the remote provider must still allow iframe embedding and you are responsible for its authorization and content rights.

The Admin panel includes **ENABLE CUSTOM PROVIDER HOSTS**, which is stored locally and defaults to **OFF**. Built-in official YouTube, Internet Archive, and Vimeo sources continue to work; turning the control on opts into any valid HTTP(S) custom provider detected from Vercel or entered in Admin.

Common audio formats include MP3, M4A, AAC, WAV, OGG, OPUS, and FLAC. Common video formats include MP4, WebM, MOV, and HLS; actual support varies by device. DRM playback and MPEG-DASH are not implemented.

## Access-control note

The Admin and VIP controls are local convenience features stored in browser storage, not authentication or authorization. Do not rely on them to protect private media or server operations.

## License and source rights

Only add streams you are authorized to distribute or play. TMDB supplies catalog metadata, not movie/series playback.
