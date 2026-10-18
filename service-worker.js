// Binger service worker.
//
// App files: NETWORK FIRST, cache as fallback. Every open gets the latest code
// when you're online (no "update available" step, no stale copies), and the
// app still opens offline. Posters and photos: cache first, capped.
// API responses are cached by the app itself (js/state/cache.js), not here.
//
// SHELL must list every file the app needs to boot; tests/shell.test.js
// fails if a file under js/ or css/ is missing from it (or listed but gone).
// Bump SW_VERSION only when this file's caching logic changes.

const SW_VERSION = 1;
const SHELL_CACHE = `binger-shell-v${SW_VERSION}`;
const IMAGE_CACHE = 'binger-images-v1';
const IMAGE_LIMIT = 400;
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'js/version.js',
  'js/config.js',
  'js/app.js',
  'js/engine/index.js',
  'js/engine/features.js',
  'js/engine/profile.js',
  'js/engine/score.js',
  'js/engine/explain.js',
  'js/engine/rank.js',
  'js/engine/seasons.js',
  'js/engine/timeline.js',
  'js/sources/genres.js',
  'js/sources/services.js',
  'js/sources/http.js',
  'js/sources/tmdb.js',
  'js/sources/anilist.js',
  'js/sources/candidates.js',
  'js/sources/lookups.js',
  'js/state/library.js',
  'js/state/store.js',
  'js/state/cache.js',
  'js/ui/dom.js',
  'js/ui/sheet.js',
  'js/ui/trailer.js',
  'js/ui/card.js',
  'js/ui/deck.js',
  'js/ui/detail.js',
  'js/ui/rate.js',
  'js/ui/library.js',
  'js/ui/taste.js',
  'js/ui/search.js',
  'js/ui/settings.js',
  'js/ui/onboarding.js',
  'js/ui/filters.js',
  'js/ui/services.js',
];

const IMAGE_HOSTS = ['image.tmdb.org', 's4.anilist.co'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, IMAGE_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([
      fetch(request, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - IMAGE_LIMIT; i++) await cache.delete(keys[i]);
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone()).then(() => trim(cache)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirstImage(request));
  }
  // Everything else (APIs, YouTube, fonts) goes straight to the network.
});
