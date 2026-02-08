/**
 * Custom Service Worker — PWA (no vite-plugin-pwa).
 * Precache core assets, runtime stale-while-revalidate, offline fallback.
 */
const CACHE_VERSION = "mom-recipes-v3";
const PRECACHE_NAME = CACHE_VERSION + "-precache";
const RUNTIME_NAME = CACHE_VERSION + "-runtime";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
];

// ——— INSTALL ———
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ——— ACTIVATE ———
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== PRECACHE_NAME && key !== RUNTIME_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ——— FETCH ———
function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isApiRequest(request) {
  const u = new URL(request.url);
  return (
    u.pathname.startsWith("/api") ||
    /\.supabase\.co$/.test(u.host) ||
    /functions\.supabase\.co$/.test(u.host)
  );
}

function isImageRequest(request) {
  const accept = request.headers.get("Accept") || "";
  return /image\//.test(accept) || /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(new URL(request.url).pathname);
}

/** Only cache GET requests with http: or https:. Skip chrome-extension:, data:, blob:, file:. */
function isCacheableUrl(urlString) {
  try {
    const u = new URL(urlString);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function safeCachePut(cacheName, request, responseClone) {
  if (request.method !== "GET" || !isCacheableUrl(request.url)) return;
  caches.open(cacheName).then((cache) => {
    cache.put(request, responseClone).catch(() => {});
  });
}

/** Stale-while-revalidate: return cached if present, then revalidate in background. */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) safeCachePut(cacheName, request, response.clone());
        return response;
      });
      return cached || fetchPromise;
    })
  );
}

/** Network first, then cache, then offline page (for navigations). */
function networkFirstWithOfflineFallback(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        safeCachePut(RUNTIME_NAME, request, copy);
      }
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
    );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (!isCacheableUrl(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  if (isApiRequest(request) || isImageRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_NAME));
    return;
  }

  // Same-origin JS/CSS/assets: stale-while-revalidate
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_NAME));
    return;
  }

  // Other: network with cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          safeCachePut(RUNTIME_NAME, request, copy);
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached || new Response("", { status: 503, statusText: "Service Unavailable" })
        )
      )
  );
});

// ——— MESSAGE (skipWaiting from UI) ———
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
