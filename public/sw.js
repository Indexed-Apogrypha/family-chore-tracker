/*
 * Offline service worker for the Family Chore Tracker PWA.
 *
 * Scope: app-shell offline support only — NOT an offline submission queue. The
 * judging flow needs the network (Server Actions -> Supabase Storage + the
 * Gemini judge), so a photo submitted offline can't be verified; queueing the
 * bytes for later replay is a deliberate future extension (see CLAUDE.md "The
 * PWA"). What this gives today: the installed PWA opens offline to a branded
 * fallback page instead of the browser's error, and immutable static assets
 * load instantly from cache.
 *
 * Strategy by request kind (GET + same-origin only — everything else passes
 * straight through, so Server Action POSTs and the cross-origin Supabase/Gemini
 * calls are never intercepted or cached):
 *   - navigations            -> network-first, fall back to the cached /offline
 *   - /_next/static/* (immutable, content-hashed) -> cache-first
 *   - a tiny shell allowlist (/icon.svg, the manifest) -> stale-while-revalidate
 *   - RSC payloads / dynamic GET data -> NOT cached (default network handling),
 *     so no stale or cross-user *authenticated* response is ever stored/served.
 *
 * Bump CACHE to invalidate everything on the next activate.
 */
const CACHE = 'chore-shell-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // The offline page is essential; the rest are best-effort so one missing
      // asset can't abort the whole install (and lose the offline fallback).
      await cache.add(OFFLINE_URL);
      await Promise.allSettled(['/icon.svg', '/manifest.webmanifest'].map((u) => cache.add(u)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}
function isShellAsset(url) {
  return url.pathname === '/icon.svg' || url.pathname === '/manifest.webmanifest';
}

// Cache-first: serve from cache, fetch + store on miss. For immutable hashed assets.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// Stale-while-revalidate: serve cache immediately, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

// Network-first navigation: prefer fresh HTML, fall back to the offline page.
async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never touch Server Action POSTs etc.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ignore cross-origin (Supabase/Gemini)

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isShellAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // Everything else (RSC payloads, per-user dynamic GETs) -> default network
  // handling, uncached, so authenticated responses are never stored or shared.
});
