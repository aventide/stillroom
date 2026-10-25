// Network-first: online visits always get the latest deploy, and every
// successful response refreshes the cache that offline launches fall back to.
const CACHE = 'stillroom';
const FILES = [
  './', 'index.html', 'nature.html', 'style.css', 'app.js', 'audio-settings.js',
  'noise-worklet.js', 'nature-worklet.js', 'manifest.webmanifest',
  'fonts/dm-sans-latin.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw error;
    }
  })());
});
