/* Service Worker — кэширование статики для мгновенной повторной загрузки */
const CACHE = 'ipl-2026-11-24';
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/telegram.js',
  '/assets/fonts/fonts.css',
  '/assets/fonts/playfair-display-cyrillic.woff2',
  '/assets/fonts/playfair-display-latin.woff2',
  '/assets/fonts/inter-cyrillic.woff2',
  '/assets/fonts/inter-latin.woff2',
  '/favicon.ico',
  '/assets/icons/favicon-32.png',
  '/assets/icons/favicon-64.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(PRECACHE).catch(function () {});
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var accept = req.headers.get('accept') || '';
  // HTML-страницы: network-first, чтобы всегда свежие данные
  if (req.mode === 'navigate' || accept.indexOf('text/html') !== -1) {
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, clone); });
      }
      return res;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  // Статика: cache-first
  e.respondWith(caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, clone); });
      }
      return res;
    }).catch(function () { return cached; });
  }));
});
