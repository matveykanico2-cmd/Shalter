// Registered unconditionally (see app.js) so the app is installable as a
// PWA — a controlling service worker is required for that regardless of
// push permission. It also is what makes the Push API work at all (it's
// what receives the push event even when no tab is open). There's
// deliberately no fetch handler: this app isn't trying to be a full
// offline-capable PWA, just an installable one — no asset caching here.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
