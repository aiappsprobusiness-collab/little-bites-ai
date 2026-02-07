/* PWA Service Worker - Mom Recipes */
const CACHE_NAME = 'mom-recipes-v2';

// Precache shell: без этого на мобильных при сбое сети respondWith отдавал undefined → белый экран
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/index.html'))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Минимальная HTML-страница, если кэша нет (не передаём undefined в respondWith)
function offlinePage() {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mom Recipes</title></head><body><p>Нет соединения.</p><button onclick="location.reload()">Обновить</button></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

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
      .catch(() =>
        caches.match(event.request)
          .then((cached) => cached || caches.match('/index.html'))
          .then((cached) => cached || offlinePage())
      )
  );
});
