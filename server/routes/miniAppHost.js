const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { findUserByUsername } = require("../data/users");
const { getBotByUserId } = require("../data/bots");

const router = express.Router();

const SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'";

const SDK_TAG = '<script src="/js/shalter-web-app.js"></script>';

function page(bot, botUser) {
  const code = bot.appCode ?? "";
  const hasSdk = code.includes("shalter-web-app.js");
  const title = (bot.appName || botUser?.name || "Приложение").replace(/[<>&]/g, "");
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
      "Cache-Control": "no-store",
    });
    res.type("text/html; charset=utf-8").send(page(bot, botUser));
  })
);

module.exports = router;
