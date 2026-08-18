// Registered unconditionally (see app.js) so the app is installable as a
// PWA — a controlling service worker is required for that regardless of
// push permission. It also is what makes the Push API work at all (it's
// what receives the push event even when no tab is open).
//
// Здесь же — хранение оболочки приложения. На плохой связи главная задержка не
// в объёме, а в количестве обращений к сети: каждое стоит своей задержки,
// сколько бы байт ни ехало. Поэтому то, что не меняется между заходами (сборка,
// стили, значки), берётся с диска, а сеть спрашивается только про новое.

const SHELL_CACHE = "shalter-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Наборы прошлых версий не нужны: адреса собранных файлов содержат метку
      // содержимого, поэтому старые записи никогда больше не совпадут.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("shalter-") && n !== SHELL_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// Что храним: собранные файлы и значки. Всё это адресуется с меткой содержимого
// или меняется крайне редко.
function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/dist/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/styles/") || url.pathname === "/manifest.webmanifest")
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
  // Ответы приложения (сообщения, чаты) не храним никогда: показать вчерашнюю
  // переписку как сегодняшнюю хуже, чем показать, что связи нет.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  if (isShellAsset(url)) {
    // Сначала с диска. Адрес содержит метку содержимого — если файл на диске
    // есть, он ровно тот, что нужен, и спрашивать сеть незачем.
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

  // Сама страница: сначала сеть, но недолго. Если за полторы секунды не
  // ответила — отдаём сохранённую и не заставляем смотреть в пустой экран;
  // свежую при этом всё равно дожидаемся и кладём на её место.
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
        const raced = await Promise.race([fromNetwork, new Promise((r) => setTimeout(() => r(null), 1500))]);
        return raced ?? cached;
      })()
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return;
  }
  const { title, body, url, tag, requireInteraction, kind, callId } = payload;
  if (!title) return;

  const isCall = kind === "call";

  event.waitUntil(
    (async () => {
      // Skip showing an OS notification if the app is already open and
      // focused — the user is already looking at it (in-app UI/ringing
      // banner covers this case), so a popup on top would just be noise.
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (clientsList.some((c) => c.focused)) return;

      await self.registration.showNotification(title, {
        body,
        tag,
        requireInteraction: !!requireInteraction,
        // Звонок — единственное, что имеет право вибрировать и перебивать: на
        // него отвечают сейчас или никогда. Ответ и сброс прямо в уведомлении,
        // чтобы не открывать приложение ради «нет, не сейчас».
        vibrate: isCall ? [300, 200, 300, 200, 300] : undefined,
        renotify: isCall || undefined,
        silent: false,
        icon: "/icons/icon.svg",
        badge: "/icons/icon.svg",
        actions: isCall
          ? [
              { action: "answer", title: "Ответить" },
              { action: "decline", title: "Отклонить" },
            ]
          : undefined,
        data: { url: url || "/", kind, callId },
      });
    })()
  );
});

// Сброс звонка прямо из уведомления — тем же запросом, каким это делает само
// приложение (PATCH статуса). credentials: "include" обязателен: без него
// сессионная кука не уйдёт и сервер откажет.
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
    // Сети нет — звонок и так не состоится; молчим, чтобы не падало
    // необработанное отклонение промиса внутри воркера.
  }
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === "decline") {
    event.waitUntil(declineCall(data.callId));
    return;
  }

  // «Ответить» и обычное нажатие ведут в одно место, но с пометкой: открытое
  // приложение по ней сразу принимает звонок, а не показывает ещё один экран с
  // кнопкой «ответить» поверх уже нажатой.
  const base = data.url || "/";
  const url = event.action === "answer" && data.callId ? `/call/${data.callId}?answer=1` : base;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an already-open tab (navigating it to the right chat/call)
      // instead of always spawning a new window.
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
