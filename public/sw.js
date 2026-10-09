// v4: статика больше не «залипает» в кэше после обновления сервера (см. fetch ниже).
const SHELL_CACHE = "shalter-shell-v4";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon-32.png",
  "/icons/favicon-16.png",
  "/icons/apple-touch-icon.png",
];

const MEDIA_CACHE = "shalter-media-v1";
const MEDIA_CACHE_MAX = 300;

// Встроенные картинки и анимации приложения: эмодзи, подарки, стикеры (lottie),
// баннеры. Раньше их кэшировал только браузер (на час), и без интернета в чатах были
// битые картинки и пустые подарки. Отдаём сразу из кэша и обновляем его в фоне.
const STATIC_MEDIA_CACHE = "shalter-static-media-v1";
const STATIC_MEDIA_MAX = 2000;
const STATIC_MEDIA_PREFIXES = ["/img/", "/tgs/", "/gift-emoji/", "/gift-symbols/", "/banners/"];

async function trimMediaCache(name = MEDIA_CACHE, max = MEDIA_CACHE_MAX) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}));
});

// Пока есть сеть — скачиваем всю текущую сборку (все экраны, а не только открытые),
// чтобы без интернета приложение открывалось целиком из кэша. Файлы прошлых сборок
// удаляем. Страница просит об этом при запуске и когда сеть возвращается.
let precaching = null;
async function precacheBuild() {
  const res = await fetch("/dist/build.json", { cache: "no-store" });
  if (!res.ok) return; // dev-режим без сборки — кэшируем по ходу работы
  const { version, precache = [] } = await res.json();
  const cache = await caches.open(SHELL_CACHE);
  if ((await cache.match("/__precached"))?.headers.get("x-version") === version) return;
  const wanted = new Set(precache.map((u) => new URL(u, self.location.origin).href));
  for (const url of wanted) {
    if (await cache.match(url)) continue;
    const r = await fetch(url, { cache: "no-cache" });
    if (r.ok) await cache.put(url, r);
  }
  const shell = await fetch("/", { cache: "no-cache" });
  if (shell.ok) await cache.put("/index.html", shell);
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.startsWith("/dist/") && !wanted.has(req.url)) await cache.delete(req);
  }
  await cache.put("/__precached", new Response("", { headers: { "x-version": version } }));
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache") return;
  precaching ??= precacheBuild().catch(() => {}).finally(() => (precaching = null));
  event.waitUntil?.(precaching);
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("shalter-") && n !== SHELL_CACHE && n !== MEDIA_CACHE && n !== STATIC_MEDIA_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/dist/") ||
      url.pathname.startsWith("/js/") ||
      url.pathname.startsWith("/styles/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/index.html" ||
      url.pathname === "/manifest.webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { cacheName: MEDIA_CACHE });
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok && res.status === 200) {
          const cache = await caches.open(MEDIA_CACHE);
          await cache.put(req, res.clone());
          trimMediaCache();
        }
        return res;
      })()
    );
    return;
  }

  if (url.origin === self.location.origin && STATIC_MEDIA_PREFIXES.some((p) => url.pathname.startsWith(p)) && !req.headers.has("range")) {
    event.respondWith(staleWhileRevalidate(event, req));
    return;
  }

  // Неизменяемые файлы (хешированные чанки сборки, ссылки с ?v=) — сразу из кэша.
  // Всё остальное (index.html, dist/app.js, исходники /js и /styles) — сначала из сети:
  // раньше они отдавались из кэша навсегда, и после обновления сервера старые модули
  // смешивались с новыми — приложение не запускалось до повторной перезагрузки.
  if (isShellAsset(url)) {
    event.respondWith(isImmutable(url) ? cacheFirst(req) : networkFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "/index.html"));
  }
});

const NETWORK_TIMEOUT_MS = 4000;

function isImmutable(url) {
  return url.searchParams.has("v") || /^\/dist\/chunk-[A-Z0-9]+\.js$/.test(url.pathname) || url.pathname.startsWith("/icons/");
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(STATIC_MEDIA_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(async (res) => {
    if (res.ok && res.status === 200) {
      await cache.put(req, res.clone());
      trimMediaCache(STATIC_MEDIA_CACHE, STATIC_MEDIA_MAX);
    }
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

// Сеть с таймаутом; без сети или при зависании — последняя сохранённая копия.
async function networkFirst(req, fallbackPath) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(fallbackPath ?? req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {}
  const cached = (await cache.match(req)) ?? (fallbackPath && (await cache.match(fallbackPath)));
  if (cached) return cached;
  return network.catch(() => Response.error());
}

async function avatarIcon(avatar) {
  if (!avatar || typeof OffscreenCanvas === "undefined") return null;
  try {
    const size = 192;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    let drawn = false;
    if (avatar.url) {
      try {
        const res = await fetch(avatar.url, { credentials: "include" });
        if (res.ok) {
          const bitmap = await createImageBitmap(await res.blob());
          const side = Math.min(bitmap.width, bitmap.height);
          ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
          drawn = true;
        }
      } catch {
      }
    }
    if (!drawn) return null;
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function pluralMessages(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} новое сообщение`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} новых сообщения`;
  return `${n} новых сообщений`;
}

// iPadOS reports a Mac user agent; a touch-capable "Mac" is an iPad.
const IS_IOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent) ||
  (/Macintosh/.test(self.navigator.userAgent) && (self.navigator.maxTouchPoints ?? 0) > 1);

async function showIosPlaceholder(title, body, tag, { closeNow = false } = {}) {
  const t = tag || "shalter";
  await self.registration.showNotification(title, { body: body || "", tag: t, icon: "/icons/icon-192.png", data: { url: "/" } });
  // The chat is already open on screen: the notification only has to have
  // been shown for iOS to count the push as visible, not linger.
  if (closeNow) for (const n of await self.registration.getNotifications({ tag: t })) n.close();
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return;
  }
  const { title, body, url, tag, requireInteraction, kind, callId, avatar, silent } = payload;

  if (kind === "call-cancelled") {
    event.waitUntil(
      (async () => {
        const shown = await self.registration.getNotifications({ tag });
        for (const n of shown) n.close();
        // iOS Safari revokes the push subscription after a few pushes that
        // show nothing ("silent push") — so there a cancel has to surface as a
        // visible notification too, or the next real message never arrives.
        if (IS_IOS) await showIosPlaceholder(title || "Звонок завершён", body, tag);
      })()
    );
    return;
  }

  if (!title) {
    if (IS_IOS) event.waitUntil(showIosPlaceholder("Shalter", body, tag));
    return;
  }

  const isCall = kind === "call";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetPath = (() => {
        try {
          return new URL(url || "/", self.location.origin).pathname;
        } catch {
          return null;
        }
      })();
      const onThisChat = clientsList.some((c) => {
        if (!c.focused) return false;
        try {
          return !!targetPath && new URL(c.url).pathname === targetPath;
        } catch {
          return false;
        }
      });
      if (onThisChat && !isCall) {
        if (IS_IOS) await showIosPlaceholder(title, body, tag, { closeNow: true });
        return;
      }

      // Аватар не дольше 1.5 с: iOS убивает воркер, если пуш долго не показан.
      const icon =
        (await Promise.race([avatarIcon(avatar), new Promise((r) => setTimeout(() => r(null), 1500))])) || "/icons/icon-192.png";

      let notifBody = body;
      let count = 1;
      if (!isCall && tag) {
        const existing = await self.registration.getNotifications({ tag });
        if (existing.length) {
          count = (existing[0].data?.count || 1) + 1;
          notifBody = `${count} ${pluralMessages(count)}${body ? ` · ${body}` : ""}`;
        }
      }

      await self.registration.showNotification(title, {
        body: notifBody,
        tag,
        requireInteraction: !!requireInteraction,
        vibrate: isCall ? [300, 200, 300, 200, 300] : undefined,
        renotify: !silent,
        silent: !!silent,
        icon,
        // Android draws the badge as the small status-bar glyph: it has to be
        // a raster, white-on-transparent silhouette (an SVG or a colour icon
        // shows up as a grey square or the browser's own bell).
        badge: "/icons/badge-96.png",
        actions: isCall
          ? [
              { action: "answer", title: "Ответить" },
              { action: "decline", title: "Отклонить" },
            ]
          : undefined,
        data: { url: url || "/", kind, callId, count },
      });
    })()
  );
});

async function declineCall(callId) {
  if (!callId) return;
  try {
    await fetch(`/api/calls/${callId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "ended" }),
    });
  } catch {
  }
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === "decline") {
    event.waitUntil(declineCall(data.callId));
    return;
  }

  const base = data.url || "/";
  const url = event.action === "answer" && data.callId ? `/call/${data.callId}?answer=1` : base;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

// Браузер (особенно Safari на iPhone) иногда сам меняет или отзывает подписку.
// Без этого пуши шли только после того, как приложение открыли и оно
// переподписалось. Переподписываемся прямо здесь, без открытия приложения.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let sub = event.newSubscription;
        if (!sub) {
          const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
          const { publicKey } = await res.json();
          const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
          const raw = atob((publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
          const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch {
      }
    })()
  );
});
