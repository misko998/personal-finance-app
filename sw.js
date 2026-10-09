// Service worker: keš svih fajlova aplikacije => radi i bez interneta.
// VAŽNO: kad promeniš bilo koji fajl aplikacije, povećaj VERSION (npr. 1.0.1),
// inače će telefoni nastaviti da koriste staru verziju iz keša.
const VERSION = '1.0.0';
const CACHE = `moj-budzet-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/backup.js',
  './js/calc.js',
  './js/charts.js',
  './js/db.js',
  './js/demo.js',
  './js/format.js',
  './js/forms.js',
  './js/icons.js',
  './js/nav.js',
  './js/seed.js',
  './js/store.js',
  './js/ui.js',
  './js/views/dashboard.js',
  './js/views/history.js',
  './js/views/categories.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  // nova verzija čeka da korisnik dodirne "Osveži" (poruka SKIP_WAITING)
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('moj-budzet-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Cache-first za fajlove aplikacije; navigacija uvek dobija index.html (radi offline).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
