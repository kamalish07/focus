// Offline support. Bump VERSION whenever you change the app files so phones pick up the update.
const VERSION = 'focus-v1.10.0';
const FONT_CACHE = 'focus-fonts';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'css/faces.css',
  'js/app.bundle.js',
  'icons/icon-96.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache forever once fetched.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App files: network first so updates show up straight away; the cache is used
  // when offline or when the network takes longer than 2.5 s.
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      const key = req.mode === 'navigate' ? 'index.html' : req;
      const net = fetch(req).then((res) => {
        if (res.ok) c.put(key, res.clone());
        return res;
      });
      e.waitUntil(net.catch(() => {}));
      const quick = await Promise.race([net.catch(() => null), new Promise((r) => setTimeout(r, 2500))]);
      if (quick) return quick;
      return (await c.match(key, { ignoreSearch: true })) || net;
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => (wins[0] ? wins[0].focus() : self.clients.openWindow('./')))
  );
});
