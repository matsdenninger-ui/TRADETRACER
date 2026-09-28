// Service Worker: macht TradeTracer offline startfähig.
// Wird von build.mjs erzeugt – Änderungen bitte in src/sw.template.js.
const VERSION = 'c357910a59';
const CACHE = `tradetracer-${VERSION}`;
const RUNTIME = 'tradetracer-runtime';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './vendor/xlsx.full.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('tradetracer-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Sync- und KI-Anfragen nie aus dem Cache beantworten
  if (/(^|\.)github(usercontent)?\.com$|anthropic\.com$/.test(url.hostname)) return;

  // App-Seite: sofort aus dem Cache, im Hintergrund aktualisieren
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      const network = fetch(req).then(res => res).catch(() => null);
      return cached || (await network) || Response.error();
    })());
    return;
  }

  // Schriftarten & Vendor-Dateien: Cache zuerst, sonst Netz (und merken)
  if (url.origin === self.location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          const cache = await caches.open(url.origin === self.location.origin ? CACHE : RUNTIME);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })());
  }
});
