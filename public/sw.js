// Service Worker for Shalter - offline caching
// v4 — клиент apps/web: старый кэш (с public/js) при активации удаляется.
const CACHE_NAME = 'shalter-v4';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate - clean old caches
// Старый кэш (shalter-v3) держал страницу прежнего клиента: открытые вкладки один раз
// перезагружаются, чтобы сразу взять новый клиент, а не показывать сломанную страницу.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k).then(() => k))))
      .then((removed) => self.clients.claim().then(() => removed))
      .then((removed) => {
        if (!removed.includes('shalter-v3')) return;
        return self.clients.matchAll({ type: 'window' }).then((wins) => Promise.all(wins.map((w) => w.navigate(w.url).catch(() => {}))));
      })
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // Pages of the app (/, /chat/…, /settings/…) - network first, so a new build shows up at
  // once; offline - the cached app page. It used to be cache first and kept an old index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === '/') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Uploads - straight to the network: access is checked per request, and with S3 the
  // server answers with a redirect to the bucket that the browser must follow itself
  // (video Range requests, its own HTTP cache).
  if (url.pathname.startsWith('/uploads/')) return;
  
  // API requests - network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // Gift scenes - from the cache at once, refreshed in the background: a regenerated
  // scene shows up on the next view without a service worker update.
  if (url.pathname.startsWith('/gift-scenes/') && url.pathname !== '/gift-scenes/index.json') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fresh = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          if (cached) {
            event.waitUntil(fresh.catch(() => {}));
            return cached;
          }
          return fresh;
        })
      )
    );
    return;
  }

  // Code and styles - network first, so fixes are not hidden by a stale cache.
  // The gift scene list too: new scenes must show up without a service worker update.
  if (/\.(css|js)$/.test(url.pathname) || url.pathname === '/' || url.pathname === '/gift-scenes/index.json') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Other static assets - cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Background sync for messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'send-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Implementation would depend on your message queue storage
  console.log('Background sync: sending queued messages');
}