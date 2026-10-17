# Stream HD Media Player

A responsive single-page media player for sources that you own or are authorized to play. It is a static site deployable to Vercel.

## Features

- Direct audio, video, HLS (`.m3u8`), and YouTube links; local audio/video files
- TMDB movie/series metadata and search
- Installable PWA app shell with offline shell caching
- Phone/tablet responsive layout, keyboard/TV remote navigation, and Picture-in-Picture where supported
- Browser-local library backup/import and channel management

## Deploy

Deploy the repository root to Vercel. Keep `index.html`, `api/`, `vercel.json`, `manifest.json`, `sw.js`, and `icon.svg` at the root. The service worker caches the app shell only; media streams remain online.

## TMDB setup

In Vercel, open **Project Settings → Environment Variables**, add either `TMDB_ACCESS_TOKEN` with the TMDB v4 Bearer token or `TMDB_API_KEY` with the TMDB v3 API key for Production and Preview, then redeploy. `TMDB_ACCESS_TOKEN` takes priority when both are present. The `/api/tmdb/*` serverless proxy injects the credential on the server, so it is not sent to browsers. Search and title metadata become available after the redeploy; when TMDB is temporarily unavailable, trending falls back to saved catalog titles. The Admin key field remains an optional local-development fallback.

The TMDB key previously embedded in the public source should be revoked/rotated before deployment.

## Jamendo music setup

Create an application in the [Jamendo developer portal](https://devportal.jamendo.com/), then add its Client ID—the public catalog API credential—to Vercel as `JAMENDO_CLIENT_ID` for Production and Preview. `JAMENDO_API_KEY` is also accepted as a fallback for compatibility, but `JAMENDO_CLIENT_ID` takes precedence when both exist. Remove any stale or incorrect `JAMENDO_API_KEY` value, redeploy after saving the verified Client ID, and test **Find Music**. **Find Music** searches Jamendo automatically and plays the returned stream URL in the built-in audio player; each result includes artist attribution and a link back to Jamendo. Use the API only within Jamendo's license terms and request limits.

## YOCINEMA setup

Add `YOCINEMA_API_KEY` to Vercel Project Settings for Production and Preview, then redeploy. Stream HD calls YOCINEMA only through `/api/yocinema`; the key is never sent to the browser. The **YOCINEMA** search button uses the catalog API, obtains a short-lived stream token server-side, and plays the returned authorized stream through the native HTML5 video player. The interface language is English by default, and YOCINEMA starts in **English translated version** mode (`type=translated`) so users do not unexpectedly receive the provider's local-language original audio. **Original audio (provider language)** remains available as an explicit alternative through `type=original`. The provider must supply the translation; Stream HD does not fabricate or dub audio. Use YOCINEMA only for content and translations you are authorized to distribute.

## Official Kenya TV channel search

Add `YOUTUBE_API_KEY` to Vercel Project Settings for Production and Preview to enable **FIND KENYA TV** searches across official YouTube channels. The key remains server-side in `/api/youtube-search`; search results are channel IDs and playback always uses each channel's official live-stream embed, never a recorded video URL. The built-in Citizen TV, NTV Kenya, KTN News, K24 TV, KBC, TV47, and Maisha TV entries remain available when the YouTube API key is missing or quota is unavailable.

YouTube also powers the **YOUTUBE AUDIO** and **YOUTUBE VIDEOS** search buttons. Results are restricted to embeddable YouTube videos and play in the in-page official YouTube player; the app does not extract or download YouTube media. **FIND MUSIC** continues to use Jamendo for direct licensed audio playback, while **FREE ARCHIVE FILMS** continues to use Internet Archive public-domain embeds, so each provider is used for the media type it supports best.

## Add media and TV

Use the paste panel to play YouTube, audio, video, or HLS links in the embedded player. **Download** uses a browser-integrated blob download for Jamendo tracks and direct media sources that permit CORS; embedded video and live HLS streams remain playback-only. Jamendo tracks include artist attribution and a link back to their Jamendo page. Direct source URLs must be absolute HTTP(S) links and work only when supported by the browser, the stream's codecs, and its CORS policy. For catalog items, add the TMDB ID for metadata and add an authorized direct MP4, WebM, MOV, or HLS URL in the optional playback field to enable **PLAY FULL**. TMDB does not provide full movie or series files.

## Authorized Movie API integration

When you own or are authorized to use the Movie API, Stream HD exposes it through the serverless `/api/movieapi` proxy. The proxy keeps the upstream hostname in server code, validates the action/type/ID parameters, disables caching, and supports:

```text
/api/movieapi?action=search&keyword=Avatar&type=movie
/api/movieapi?action=stream&id=3737&type=movie
/api/movieapi?action=stream&id=77&type=tv&season=1&episode=1
```

The player controls include **AUTHORIZED MOVIE API** and **AUTHORIZED SERIES API** search actions. Movie results call the stream endpoint with the returned numeric ID. Series results ask for season and episode, then call the same endpoint with those parameters. Stream response URLs are accepted only after HTTP(S) validation and are played through the existing direct-media pipeline. The provider must return a playable, authorized URL; upstream errors such as HTTP 403 are surfaced to the user instead of being hidden.

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
