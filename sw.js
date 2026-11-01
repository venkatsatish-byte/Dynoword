// Generated at build time by vite.config.js.
const CACHE = 'dynoword-mvxdqsvq';
const ASSETS = ["./","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/apple-touch-icon.png","icons/favicon-32.png","legal/legal.css","legal/terms.html","legal/privacy.html","legal/refunds.html","./assets/index-HsvII-Sg.css","./assets/index-i_gYiWDJ.js","./assets/docx-export-DO29Ypn0.js","./assets/index-DhvGuJGL.js","./assets/index.esm-CiyOZeeX.js","./assets/index.esm-d4yMCybm.js","./assets/index.esm-Cl6goRim.js"];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dynoword-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page so updates arrive; fall back to the cached shell offline.
    event.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  // ignoreVary: module scripts are requested in CORS mode (with an Origin header), unlike the precache requests.
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
