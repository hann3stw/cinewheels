// Service Worker: alle App-Dateien vorab cachen -> vollständig offline nutzbar.
// Bei Änderungen an Dateien VERSION erhöhen, damit Clients die neue Fassung laden.
const VERSION = 'cinewheels-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/settings.js',
  './js/wheels.js',
  './js/camera.js',
  './js/hud.js',
  './js/scene.js',
  './js/modes.js',
  './js/score.js',
  './js/ui.js',
  './js/vendor/three.module.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst (mit Timeout), Cache als Rückfall: online immer aktuell, offline voll nutzbar.
const NET_TIMEOUT_MS = 3000;

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      // Netz zu langsam: Cache liefern, falls vorhanden
      caches.match(req, { ignoreSearch: true }).then(hit => { if (hit && !done) { done = true; resolve(hit); } });
    }, NET_TIMEOUT_MS);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!done) { done = true; resolve(fromCache(req)); }
    });
  }));
});
