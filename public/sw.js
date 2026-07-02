const CACHE_NAME = 'ca-manager-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => {
          return fetch(asset)
            .then((res) => {
              if (res && res.status === 200) {
                return cache.put(asset, res);
              }
              console.warn(`[SW] Non-200 response for ${asset}: ${res ? res.status : 'no response'}`);
            })
            .catch((err) => {
              console.warn(`[SW] Failed to fetch and cache ${asset}:`, err);
            });
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass service worker for API routes, hot-reload WebSockets, and webpack requests
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next') ||
    url.pathname.includes('webpack') ||
    url.pathname.includes('hmr')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-First with Cache-Fallback strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache success responses for the specified key assets
        if (response && response.status === 200 && ASSETS_TO_CACHE.includes(url.pathname)) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Serve from cache if offline
        return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigation request fails, return cached root '/'
          if (event.request.mode === 'navigate') {
            return caches.match('/', { ignoreSearch: true });
          }
          return new Response('Offline mode enabled. Connect to internet to refresh.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});
