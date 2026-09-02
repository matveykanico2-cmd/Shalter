// Registered unconditionally (see app.js) so the app is installable as a
// PWA — a controlling service worker is required for that regardless of
// push permission. It also is what makes the Push API work at all (it's
// what receives the push event even when no tab is open).
//
// Здесь же — хранение оболочки приложения. На плохой связи главная задержка не
// в объёме, а в количестве обращений к сети: каждое стоит своей задержки,
// сколько бы байт ни ехало. Поэтому то, что не меняется между заходами (сборка,
// стили, значки), берётся с диска, а сеть спрашивается только про новое.

// v2, а не v1: в первой версии сюда попадали /styles/*.css из исходников — без
// версии в адресе, а значит навсегда. Смена имени заставляет activate ниже
// выбросить старый набор целиком и не отдавать больше ту застрявшую копию.
const SHELL_CACHE = "shalter-shell-v2";

// Вложения, осевшие на самом устройстве.
//
// Смысл отдельного хранилища: файл из переписки не меняется никогда — по
// адресу /uploads/<отпечаток> лежит ровно одно содержимое и другого там не
// будет (имя выводится из самого файла, см. routes/uploads.js). Значит,
// скачав его один раз, спрашивать сервер больше не за чем.
//
// Что это даёт: повторные открытия чата не трогают сеть вовсе, а сервер
// перестаёт отдавать одну и ту же картинку сто раз. Место на сервере при этом
// не освобождается — файл там по-прежнему лежит, потому что его должен
// получить и тот, кто ещё не заходил.
const MEDIA_CACHE = "shalter-media-v1";
// Браузер не даёт хранить сколько угодно и вычищает старое сам, когда на
// устройстве кончается место. Свой предел нужен, чтобы не занимать чужую квоту
// целиком: держим последние 300 файлов, остальное вытесняем сами.
const MEDIA_CACHE_MAX = 300;

async function trimMediaCache() {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MEDIA_CACHE_MAX) return;
  // Записи лежат в порядке добавления — убираем самые старые.
  await Promise.all(keys.slice(0, keys.length - MEDIA_CACHE_MAX).map((k) => cache.delete(k)));
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Наборы прошлых версий не нужны: адреса собранных файлов содержат метку
      // содержимого, поэтому старые записи никогда больше не совпадут.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("shalter-") && n !== SHELL_CACHE && n !== MEDIA_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// Что храним: собранные файлы и значки.
//
// Условие тут ровно одно: адрес обязан меняться вместе с содержимым — потому
// что ниже это отдаётся с диска и сеть не спрашивается вообще никогда. Собранные
// файлы ему отвечают (scripts/build.js дописывает к ним ?v=<метка>), значки и
// manifest меняются разве что вместе с версией приложения, а её отрабатывает
// смена имени набора выше.
//
// А вот /styles/*.css из исходников — это ровно тот случай, когда условие не
// выполняется: в режиме разработки index.html ссылается на них без всякой
// версии, так что первая же копия оставалась в кэше навсегда. Любая правка
// стилей после этого была не видна, сколько страницу ни перезагружай: разметка
// приезжала новая, оформление — вчерашнее. Поэтому их здесь больше нет; в
// боевой сборке они всё равно лежат по /dist/styles/ и попадают под первую
// проверку.
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
  // Ответы приложения (сообщения, чаты) не храним никогда: показать вчерашнюю
  // переписку как сегодняшнюю хуже, чем показать, что связи нет.
  // Ответы приложения (сообщения, чаты) не храним никогда: показать вчерашнюю
  // переписку как сегодняшнюю хуже, чем показать, что связи нет.
  if (url.pathname.startsWith("/api/")) return;

  // Вложения — наоборот, храним у себя: содержимое по такому адресу неизменно.
  // Сначала смотрим на устройстве, в сеть идём только если там пусто.
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { cacheName: MEDIA_CACHE });
        if (cached) return cached;
        const res = await fetch(req);
        // Кладём только целые ответы: кусок файла (206) в хранилище бесполезен,
        // а перемотка видео присылает именно такие.
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

  // Звонок отменили (не дозвонились, отменили, ответили с другого устройства).
  // Показывать нечего — надо, наоборот, убрать висящее уведомление о нём:
  // requireInteraction само его не погасит, и человек вернётся к телефону,
  // увидит «вам звонят» и ответит на разговор, которого уже нет.
  // "call-missed" приходит вместо гашения, когда до человека не дозвонились:
  // это обычное уведомление и показывается обычным путём ниже. Отдельной ветки
  // ему не нужно — важно лишь не спутать его с отменой.
  if (kind === "call-cancelled") {
    event.waitUntil(
      (async () => {
        const shown = await self.registration.getNotifications({ tag });
        for (const n of shown) n.close();
      })()
    );
    return;
  }

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
