/* ==========================================================
   CRISPY STATUS — Service Worker v2
   ========================================================== */

const CACHE = 'crispy-v2';
const SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    // Don't cache CDN resources (FFmpeg) — they're large and versioned
    if (e.request.url.includes('unpkg.com')) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            // Serve cached version, but also fetch fresh in background
            const fetchPromise = fetch(e.request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
