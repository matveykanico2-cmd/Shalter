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

// ---------- Сборка без сети ----------
// Страница (use-service-worker.ts) просит об этом при запуске и когда сеть вернулась: пока сеть
// есть, скачиваем всю текущую сборку (все экраны, а не только открытые), чтобы без интернета
// приложение открывалось целиком из кэша. Список файлов сборки — /assets/precache-<хеш>.json
// (scripts/build.js, ссылка в <meta name="shalter-precache"> страницы); файлы прошлых сборок удаляем.
let precaching = null;
async function precacheBuild() {
  const page = await fetch('/', { cache: 'no-cache' });
  if (!page.ok) return;
  const html = await page.clone().text();
  const cache = await caches.open(CACHE_NAME);
  const listUrl = (/<meta name="shalter-precache" content="([^"]+)"/.exec(html) || [])[1] || null;
  if (listUrl && (await cache.match('/__precached'))?.headers.get('x-list') === listUrl) {
    await cache.put('/', page);
    return;
  }
  const wanted = new Set(html.match(/\/assets\/[^"'\s)<>]+/g) || []);
  if (listUrl) {
    const res = await fetch(listUrl);
    if (res.ok) for (const path of await res.json()) wanted.add(path);
  }
  for (const path of wanted) {
    const url = new URL(path, self.location.origin).href;
    if (await cache.match(url)) continue;
    const res = await fetch(url);
    if (res.ok) await cache.put(url, res);
  }
  await cache.put('/', page);
  if (!listUrl) return; // сборка без списка (dev) — старое не трогаем
  for (const req of await cache.keys()) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/assets/') && !wanted.has(pathname)) await cache.delete(req);
  }
  await cache.put('/__precached', new Response('', { headers: { 'x-list': listUrl } }));
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache') return;
  precaching ??= precacheBuild().catch(() => {}).finally(() => (precaching = null));
  event.waitUntil?.(precaching);
});

// ---------- Push-уведомления (server/push.js: { title, body, url, tag, kind, avatar, … }) ----------
// Без обработчика 'push' браузер показывал вместо сообщения своё «Сайт обновлён в фоне»
// (Chrome) или ничего (iOS — и через пару таких пушей отзывал подписку).

async function avatarIcon(avatar) {
  if (!avatar?.url || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const size = 192;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const res = await fetch(avatar.url, { credentials: 'include' });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function pluralMessages(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'новое сообщение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'новых сообщения';
  return 'новых сообщений';
}

// iPadOS называет себя Mac; «Mac» с сенсорным экраном — это iPad.
const IS_IOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent) || (/Macintosh/.test(self.navigator.userAgent) && (self.navigator.maxTouchPoints ?? 0) > 1);

// iOS отзывает подписку после нескольких пушей, которые ничего не показали («тихий пуш»),
// поэтому там уведомление показываем всегда (и сразу убираем, если чат и так открыт).
async function showIosPlaceholder(title, body, tag, { closeNow = false } = {}) {
  const t = tag || 'shalter';
  await self.registration.showNotification(title, { body: body || '', tag: t, icon: '/icons/icon-192.png', data: { url: '/' } });
  if (closeNow) for (const n of await self.registration.getNotifications({ tag: t })) n.close();
}

// Кнопки уведомления о сообщении. Браузеры показывают 2–3 кнопки (Notification.maxActions).
function messageActions() {
  const max = typeof Notification !== 'undefined' && Notification.maxActions ? Notification.maxActions : 2;
  return [
    { action: 'reply', title: 'Ответить', type: 'text', placeholder: 'Сообщение…' },
    { action: 'read', title: 'Прочитано' },
    { action: 'delete', title: 'Удалить' },
  ].slice(0, Math.max(2, max));
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return;
  }
  const { title, body, url, tag, requireInteraction, kind, callId, avatar, silent, chatId, messageId } = payload;

  if (kind === 'call-cancelled') {
    event.waitUntil(
      (async () => {
        for (const n of await self.registration.getNotifications({ tag })) n.close();
        if (IS_IOS) await showIosPlaceholder(title || 'Звонок завершён', body, tag);
      })()
    );
    return;
  }
  if (!title) {
    if (IS_IOS) event.waitUntil(showIosPlaceholder('Shalter', body, tag));
    return;
  }
  const isCall = kind === 'call';

  event.waitUntil(
    (async () => {
      // Этот чат открыт и окно в фокусе — уведомление не нужно (звонок показываем всегда).
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      let targetPath = null;
      try {
        targetPath = new URL(url || '/', self.location.origin).pathname;
      } catch {}
      const onThisChat = windows.some((c) => {
        try {
          return c.focused && !!targetPath && new URL(c.url).pathname === targetPath;
        } catch {
          return false;
        }
      });
      if (onThisChat && !isCall) {
        if (IS_IOS) await showIosPlaceholder(title, body, tag, { closeNow: true });
        return;
      }

      // Аватар — не дольше 1,5 с: iOS убивает воркер, если пуш долго не показан.
      const icon = (await Promise.race([avatarIcon(avatar), new Promise((r) => setTimeout(() => r(null), 1500))])) || '/icons/icon-192.png';

      let notifBody = body;
      let count = 1;
      if (!isCall && tag) {
        const existing = await self.registration.getNotifications({ tag });
        if (existing.length) {
          count = (existing[0].data?.count || 1) + 1;
          notifBody = `${count} ${pluralMessages(count)}${body ? ` · ${body}` : ''}`;
        }
      }

      await self.registration.showNotification(title, {
        body: notifBody,
        tag,
        requireInteraction: !!requireInteraction,
        vibrate: isCall ? [300, 200, 300, 200, 300] : undefined,
        renotify: !!tag && !silent,
        silent: !!silent,
        icon,
        // Android рисует badge значком в строке состояния: белый силуэт на прозрачном.
        badge: '/icons/badge-96.png',
        actions: isCall
          ? [
              { action: 'answer', title: 'Ответить' },
              { action: 'decline', title: 'Отклонить' },
            ]
          : kind === 'message' && chatId
            ? messageActions()
            : undefined,
        data: { url: url || '/', kind, callId, count, chatId, messageId },
      });
    })()
  );
});

async function apiCall(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const chat = data.chatId ? encodeURIComponent(data.chatId) : null;

  if (event.action === 'decline') {
    if (data.callId) event.waitUntil(apiCall('PATCH', `/api/calls/${encodeURIComponent(data.callId)}`, { status: 'ended' }));
    return;
  }
  if (event.action === 'read' && chat) {
    event.waitUntil(apiCall('POST', `/api/chats/${chat}/read`));
    return;
  }
  if (event.action === 'delete' && chat && data.messageId) {
    event.waitUntil(apiCall('DELETE', `/api/chats/${chat}/messages/${encodeURIComponent(data.messageId)}`, { forEveryone: false }));
    return;
  }
  // Ответ прямо из уведомления (где браузер умеет поле ввода): ответом на это сообщение,
  // и чат — прочитанным. Не вышло — открываем чат.
  if (event.action === 'reply' && chat && typeof event.reply === 'string' && event.reply.trim()) {
    event.waitUntil(
      (async () => {
        const ok = await apiCall('POST', `/api/chats/${chat}/messages`, {
          text: event.reply.trim(),
          replyToId: data.messageId || undefined,
          clientId: `sw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        });
        if (ok) await apiCall('POST', `/api/chats/${chat}/read`);
        else await self.clients.openWindow(`/chat/${chat}`);
      })()
    );
    return;
  }

  const url = event.action === 'answer' && data.callId ? `/call/${encodeURIComponent(data.callId)}?answer=1` : event.action === 'reply' && chat ? `/chat/${chat}` : data.url || '/';
  event.waitUntil(
    (async () => {
      const target = new URL(url, self.location.origin);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === target.origin) ?? windows[0];
      if (client && 'focus' in client) {
        await client.focus();
        // Открытое приложение переходит само, без перезагрузки (use-device-bridges.ts);
        // страница не ответила (не наше приложение, старая вкладка) — переходим как раньше.
        const handled = await new Promise((resolve) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => resolve(false), 1000);
          channel.port1.onmessage = () => {
            clearTimeout(timer);
            resolve(true);
          };
          try {
            client.postMessage({ type: 'shalter:open', path: target.pathname + target.search }, [channel.port2]);
          } catch {
            clearTimeout(timer);
            resolve(false);
          }
        });
        if (!handled && 'navigate' in client) await client.navigate(target.href).catch(() => {});
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});

// Браузер (особенно Safari на iPhone) сам меняет или отзывает подписку — переподписываемся
// здесь же, не дожидаясь, пока приложение откроют.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let sub = event.newSubscription;
        if (!sub) {
          const res = await fetch('/api/push/vapid-public-key', { credentials: 'include' });
          const { publicKey } = await res.json();
          const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
          const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
          sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
        }
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch {}
    })()
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