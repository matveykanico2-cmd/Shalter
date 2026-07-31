// Push notifications only — no offline caching/asset intercepting here.
// A service worker is required for the Push API to work at all (it's what
// receives the push event even when no tab is open), but this app isn't
// trying to be a full offline-capable PWA, so there's no fetch handler.

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
  const { title, body, url, tag, requireInteraction } = payload;
  if (!title) return;

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
        data: { url: url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
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
