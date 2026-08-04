const CACHE = 'nova-plus-shell-v6.0.2';
const SHELL = [
  '/', '/index.html', '/catalogo-de-peliculas.html', '/catalogo-de-series.html',
  '/favoritos.html', '/detalle.html', '/assets/css/app.css?v=6.0',
  '/assets/images/nova-plus-logo-dark.png', '/icons/icon-192.png', '/icons/icon-512.png',
  '/manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('nova-plus-shell-')).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || /\/api\/|\.m3u8($|\?)|\.mp4($|\?)|imasdk|doubleclick|monetag|adsterra|hilltopads/i.test(req.url)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => { const clone=res.clone(); caches.open(CACHE).then(c=>c.put(req,clone)); return res; }).catch(()=>caches.match(req).then(r=>r||caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok && ['style','script','image','font'].includes(req.destination)) { const clone=res.clone(); caches.open(CACHE).then(c=>c.put(req,clone)); } return res; })));
});
