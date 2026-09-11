/**
 * Pointat PWA Service Worker (sw.js)
 * Enables offline caching, background resilience, and full PWA installability.
 */

const CACHE_NAME = 'pointat-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon.svg',
  '/offline',
];

// Install: precache essential static assets & skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[SW] Pre-caching partial error (ignored):', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: cleanup stale caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategy routing
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Skip cross-origin requests (e.g. Supabase, Upstash, Sentry, CDNs)
  if (url.origin !== self.location.origin) {
    return;
  }

  // API Requests: Network-only, fail cleanly without stale caching
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Static Assets (Next.js chunks, fonts, images, icons): Stale-While-Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Page Navigations: Network-first, fallback to cache or /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('/offline').then((offlineResponse) => {
              return (
                offlineResponse ||
                new Response(
                  '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>Pointat - بدون اتصال</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;background:#070612;color:#fff;"><h1>لا يوجد اتصال بالإنترنت</h1><p>أنت تتصفح بدون اتصال بالإنترنت. يرجى إعادة الاتصال بالشبكة للمتابعة.</p></body></html>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
              );
            });
          });
        })
    );
  }
});
