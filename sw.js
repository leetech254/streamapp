const CACHE_NAME = 'stream-hd-shell-v9';
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
    const cache = await caches.open(CACHE_NAME);
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
    await Promise.all(keys.filter(key => key.startsWith('stream-hd-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {}
  return response;
}

async function networkFirst(request) {
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    return (await caches.match(request)) || (await caches.match('/index.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function shellFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return networkFirst(request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(shellFirst(request));
});
