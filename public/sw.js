/**
 * Custom Service Worker — PWA (no vite-plugin-pwa).
 * Precache core assets, runtime stale-while-revalidate, offline fallback.
 * Auth/API/Supabase routes are never intercepted to avoid loops and rate limits.
 */
const CACHE_VERSION = "__APP_BUILD_VERSION__";
const PRECACHE_NAME = CACHE_VERSION + "-precache";
const RUNTIME_NAME = CACHE_VERSION + "-runtime";
const OFFLINE_URL = "/offline.html";

// Не кэшируем "/" и index.html в precache — навигация всегда network-first, чтобы OG-теги и HTML были свежими после деплоя
const PRECACHE_ASSETS = [
  "/manifest.json",
  "/offline.html",
  "/splash/splash-screen.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
];

// Маршруты, которые SW не перехватывает (ни fetch, ни navigation fallback) — избегаем циклов и флуда auth-запросов
const BLOCKED_PATH_PREFIXES = [
  "/auth",
  "/api",
  "/functions",
  "/rest",
  "/storage",
];
function isBlockedPath(pathname) {
  return BLOCKED_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ——— INSTALL ———
// skipWaiting() только по сообщению SKIP_WAITING (из UI), чтобы не создавать цикл переустановки
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
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
  if (isBlockedPath(u.pathname)) return true;
  if (u.pathname.startsWith("/api")) return true;
  if (/\.supabase\.co$/i.test(u.host)) return true;
  if (/\.supabase\.co\//i.test(request.url)) return true;
  return false;
}

/** Запросы к самому SW или manifest — не перехватываем, чтобы браузер всегда получал свежую версию (избегаем цикла обновлений). */
function isWorkerOrManifestRequest(request) {
  const u = new URL(request.url);
  return u.pathname === "/sw.js" || u.pathname === "/manifest.json";
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
// IMPORTANT: Never cache Supabase/API requests to prevent infinite revalidation loops
function staleWhileRevalidate(request, cacheName) {
  const u = new URL(request.url);
  const isSupabaseApi =
    u.hostname.includes("supabase.co") ||
    u.pathname.startsWith("/rest/v1/") ||
    u.pathname.startsWith("/auth/v1/") ||
    u.pathname.startsWith("/functions/v1/") ||
    u.pathname.startsWith("/realtime/v1/");
  if (isSupabaseApi) return fetch(request);

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

/** Network first, then cache, then offline page (for navigations). Не используется для /auth, /api и т.д. */
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

  // Браузер должен всегда получать свежий sw.js и manifest.json — не перехватываем (избегаем цикла обновлений SW)
  if (isWorkerOrManifestRequest(request)) {
    return;
  }

  // Auth, API, Supabase: не перехватывать вообще
  if (isApiRequest(request)) {
    return;
  }

  if (isNavigationRequest(request)) {
    const pathname = new URL(request.url).pathname;
    if (isBlockedPath(pathname)) {
      return;
    }
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  if (isImageRequest(request)) {
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
