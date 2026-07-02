/* Active Service Worker for PWA Installation */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple fetch bypass to satisfy Google Chrome's PWA install requirements
  // without caching index.html or chunk files which causes "Unexpected token '<'" caching issues.
  event.respondWith(fetch(event.request));
});
