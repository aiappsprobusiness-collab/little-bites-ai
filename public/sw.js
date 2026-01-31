/* PWA Service Worker - Little Bites AI */
const CACHE_NAME = 'little-bites-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация (document): при 404 отдаём index.html, чтобы SPA работало после кэша
  const isNav = event.request.mode === 'navigate';
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isNav && !response.ok) {
          return caches.match('/index.html').then((cached) => cached || response);
        }
        const clone = response.clone();
        if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});
