/* ==========================================================
   CRISPY STATUS — Service Worker
   Caches app shell for offline loading & PWA install
   ========================================================== */

const CACHE = 'crispy-v1';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

/* Cache app shell on install */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
  );
  self.skipWaiting();
});

/* Clean old caches on activate */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Serve from cache, fall back to network */
self.addEventListener('fetch', (e) => {
  // Skip non-GET and cross-origin FFmpeg requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
