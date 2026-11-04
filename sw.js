const VERSION = 'v14';
const SHELL_CACHE = `stream-hd-shell-${VERSION}`;
const MEDIA_CACHE = `stream-hd-media-${VERSION}`;
const SUBTITLE_CACHE = `stream-hd-subtitles-${VERSION}`;
const CACHE_PREFIX = 'stream-hd-';
const MAX_MEDIA_ENTRIES = 12;
const MAX_SUBTITLE_ENTRIES = 40;
const MAX_CACHEABLE_MEDIA_BYTES = 250 * 1024 * 1024;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(APP_SHELL.map(async asset => {
      try {
        const response = await fetch(asset, { cache: 'no-cache' });
        if (response.ok) await cache.put(asset, response);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, MEDIA_CACHE, SUBTITLE_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSubtitleRequest(request, url) {
  const path = url.pathname.toLowerCase();
  return request.destination === 'track' || /\.(?:vtt|webvtt|srt|ass|ssa)(?:$|[?#])/.test(path) || /(?:subtitle|captions?)(?:[./_-]|$)/i.test(path);
}

function isMediaRequest(request, url) {
  const path = url.pathname.toLowerCase();
  return ['audio', 'video'].includes(request.destination) || /\.(?:mp4|m4v|webm|mov|ogv|ogg|mp3|m4a|aac|wav|flac|m3u8|mpd|ts|m4s|aac)(?:$|[?#])/.test(path);
}

function canonicalRequest(request) {
  return new Request(request.url, { method: 'GET', headers: { Accept: request.headers.get('Accept') || '*/*' } });
}

function cacheableResponse(response, media = false) {
  if (!response || !(response.ok || response.type === 'opaque')) return false;
  if (media && response.status === 206) return false;
  const length = Number(response.headers.get('content-length') || 0);
  return !media || !length || length <= MAX_CACHEABLE_MEDIA_BYTES;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function putBounded(cacheName, request, response, maxEntries, media = false) {
  if (!cacheableResponse(response, media)) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(canonicalRequest(request), response.clone());
    await trimCache(cacheName, maxEntries);
  } catch {}
}

function offlineResponse(message = 'This media is not available offline.') {
  return new Response(message, { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value || '');
  if (!match || !size) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

async function rangeFromCachedResponse(response, rangeHeader) {
  if (!rangeHeader || response.status === 206) return response;
  try {
    const body = await response.arrayBuffer();
    const range = parseRange(rangeHeader, body.byteLength);
    if (!range) return response;
    const chunk = body.slice(range.start, range.end + 1);
    const headers = new Headers(response.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(chunk.byteLength));
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${body.byteLength}`);
    headers.delete('Content-Encoding');
    return new Response(chunk, { status: 206, statusText: 'Partial Content', headers });
  } catch {
    return response;
  }
}

async function networkFirst(request, cacheName = SHELL_CACHE) {
  try {
    const response = await fetch(request);
    if (response.ok) await putBounded(cacheName, request, response, cacheName === SHELL_CACHE ? 20 : MAX_SUBTITLE_ENTRIES);
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(canonicalRequest(request))) || (await caches.match('/index.html')) || offlineResponse('Stream HD is offline.');
  }
}

async function shellFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return networkFirst(request, SHELL_CACHE);
}

async function subtitleFirst(request) {
  const key = canonicalRequest(request);
  const cached = await caches.match(key);
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') await putBounded(SUBTITLE_CACHE, request, response, MAX_SUBTITLE_ENTRIES);
    return response;
  } catch {
    return cached || offlineResponse('Subtitle is not cached for offline playback.');
  }
}

async function mediaFirst(request) {
  const key = canonicalRequest(request);
  const cached = await caches.match(key);
  const range = request.headers.get('Range');
  if (cached) return rangeFromCachedResponse(cached, range);
  try {
    const response = await fetch(request);
    // A 206 response is intentionally not cached: it is only one byte range.
    // A complete 200 response can be replayed offline and converted to ranges.
    if (response.status === 200) await putBounded(MEDIA_CACHE, request, response, MAX_MEDIA_ENTRIES, true);
    return response;
  } catch {
    const fallback = await caches.match(key);
    return fallback ? rangeFromCachedResponse(fallback, range) : offlineResponse('Video or audio is not cached for offline playback.');
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (isSubtitleRequest(request, url)) {
    event.respondWith(subtitleFirst(request));
    return;
  }
  if (isMediaRequest(request, url)) {
    event.respondWith(mediaFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
  event.respondWith(shellFirst(request));
});
