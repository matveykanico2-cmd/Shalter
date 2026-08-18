const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { findUserByUsername } = require("../data/users");
const { getBotByUserId } = require("../data/bots");

// Раздача мини-приложений, у которых нет своего сервера: HTML лежит в базе
// (bots.appCode), автор кладёт его туда одним вызовом Bot API setWebAppCode.
// Смысл в том, чтобы порог был нулевым — токен есть, значит уже можно сделать
// приложение с интерфейсом, не поднимая ни хостинга, ни домена, ни https.
//
// ── Почему здесь стоит sandbox, и почему без него нельзя ────────────────────
//
// Страница чужая, а отдаётся она с адреса самого Shalter. Это значит, что по
// обычным правилам браузера её скрипт — «свой» для нашего домена: он может
// сходить запросом на /api/… , и браузер приложит к запросу сессионную куку.
// То есть автор любого бота получил бы возможность действовать в приложении от
// имени каждого, кто это приложение открыл: прочитать переписку, отправить
// сообщения, сменить пароль.
//
// Заголовок ниже это отрезает: `Content-Security-Policy: sandbox` заставляет
// браузер считать документ пришедшим с «пустого» источника — без доступа к
// нашим кукам, localStorage и без права называться нашим доменом в запросах.
// allow-scripts оставлен (иначе приложение не приложение), allow-same-origin
// намеренно НЕ дан — именно он вернул бы всё вышеописанное. Тот же документ
// открывается и напрямую по ссылке, поэтому защита обязана быть в заголовке
// ответа, а не только в атрибутах iframe у нас в интерфейсе.
const router = express.Router();

// frame-ancestors 'self' — вместо глобального X-Frame-Options: DENY
// (server/index.js). Тот запрет верен для всего приложения и неверен ровно
// здесь: эту страницу обязано вкладывать в себя окно мини-приложения, и
// именно оно — единственный, кому это позволено. Заголовок XFO ниже снимается,
// иначе браузер продолжит запрещать по нему.
const SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'";

// Скрипт моста подставляется автоматически: без него страница не знает, кто её
// открыл, а забыть строку подключения — первая ошибка, которую делает каждый.
const SDK_TAG = '<script src="/js/shalter-web-app.js"></script>';

function page(bot, botUser) {
  const code = bot.appCode ?? "";
  const hasSdk = code.includes("shalter-web-app.js");
  const title = (bot.appName || botUser?.name || "Приложение").replace(/[<>&]/g, "");
  // Полноценная страница, если автор прислал документ целиком, и обёртка
  // вокруг фрагмента, если он прислал только разметку: и то и другое —
  // нормальное «я написал приложение», и падать на втором незачем.
  if (/<html[\s>]/i.test(code)) return hasSdk ? code : code.replace(/<head[^>]*>/i, (m) => `${m}\n${SDK_TAG}`);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
${hasSdk ? "" : SDK_TAG}
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.45; }
</style>
</head>
<body>
${code}
</body>
</html>`;
}

router.get(
  "/:username",
  asyncRoute(async (req, res) => {
    const username = String(req.params.username || "").replace(/^@/, "");
    const botUser = await findUserByUsername(username);
    const bot = botUser ? await getBotByUserId(botUser.id) : null;
    if (!bot?.appCode) return res.status(404).type("text/plain; charset=utf-8").send("Приложение не найдено");

    res.removeHeader("X-Frame-Options");
    res.set({
      "Content-Security-Policy": SANDBOX,
      "X-Content-Type-Options": "nosniff",
      // Страница меняется, как только автор пришлёт новый код, — кэшировать её
      // значит показывать вчерашнюю версию тому, кто только что её починил.
      "Cache-Control": "no-store",
    });
    res.type("text/html; charset=utf-8").send(page(bot, botUser));
  })
);

module.exports = router;
