// Offline support. App files are saved on install; the photo reader is saved the first time it is used.
const CACHE = 'shocks-8377f62d73';
const SHELL = ['./', 'index.html', 'app.js', 'parse.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'vendor/tesseract.min.js'];
const READER = 'shocks-reader-v7'; // big OCR files, kept across app updates

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== READER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/') && !url.pathname.endsWith('tesseract.min.js')) {
    e.respondWith(caches.open(READER).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }))));
    return;
  }
  if (req.mode === 'navigate' || /\.(js|html|webmanifest)$/.test(url.pathname)) {
    // network first (short wait) so updates arrive; saved copy when offline
    e.respondWith(Promise.race([
      fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? 'index.html' : req, cp)); } return r; }),
      new Promise((_, rej) => setTimeout(rej, 3000))
    ]).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
