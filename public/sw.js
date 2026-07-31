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
