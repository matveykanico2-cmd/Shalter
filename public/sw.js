const SHELL_CACHE = "shalter-shell-v2";

const MEDIA_CACHE = "shalter-media-v1";
const MEDIA_CACHE_MAX = 300;

// API-ответы: подкачка «свежили» — сразу из кэша, фоном свежее от сервера.
// На плохом интернете история и список чатов открываются мгновенно.
const API_CACHE = "shalter-api-v1";
const API_CACHE_MAX = 200;
const API_STALE_MS = 10_000;

async function trimMediaCache() {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MEDIA_CACHE_MAX) return;
  await Promise.all(keys.slice(0, keys.length - MEDIA_CACHE_MAX).map((k) => cache.delete(k)));
}

async function trimApiCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= API_CACHE_MAX) return;
  await Promise.all(keys.slice(0, keys.length - API_CACHE_MAX).map((k) => cache.delete(k)));
}

function isCacheableApi(url) {
  const p = url.pathname;
  // Только GET-истории и каталоги — не мутируют, можно кэшировать.
  return (
    p === "/api/chats" ||
    p.startsWith("/api/chats?") ||
    (p.startsWith("/api/messages/") && !p.endsWith("/send") && !p.endsWith("/read")) ||
    p === "/api/gifts" ||
    p.startsWith("/api/users/")
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("shalter-") && n !== SHELL_CACHE && n !== MEDIA_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/dist/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest")
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

  // API GET: stale-while-revalidate + offлайн fallback на кэш.
  if (req.method === "GET" && isCacheableApi(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(req);
        const serve = cached?.headers.get("x-stale-at")
          ? (() => {
              const age = Date.now() - Number(cached.headers.get("x-stale-at"));
              return age < API_STALE_MS ? cached : null;
            })()
          : cached;
        const network = fetch(req).then((res) => {
          if (res.ok) {
            cache.put(req, res.clone());
            trimApiCache(cache);
            // Признак «свежести» для сравнения в следующий раз.
            const headers = new Headers(res.headers);
            headers.set("x-stale-at", String(Date.now()));
            return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
          }
          return res;
        }).catch(() => cached || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } }));
        // Не старше TTL — сразу из кэша, фоном подхватим свежее.
        if (serve) return Promise.race([network, cached]);
        return network;
      })()
    );
    return;
  }


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

  if (isShellAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      })()
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const fromNetwork = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        const cached = await cache.match(req);
        if (!cached) return (await fromNetwork) ?? Response.error();
        const raced = await Promise.race([fromNetwork, new Promise((r) => setTimeout(() => r(null), 300))]);
        return raced ?? cached;
      })()
    );
  }
});

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
