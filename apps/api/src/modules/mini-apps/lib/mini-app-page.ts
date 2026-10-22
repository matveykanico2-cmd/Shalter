// Страница мини-приложения бота — page() из server/routes/miniAppHost.js.

/** Песочница: свои скрипты и формы, но не наш origin; встраивать — только к нам. */
export const MINI_APP_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'";

const SDK_TAG = '<script src="/js/shalter-web-app.js"></script>';

/** Целая страница — как есть (SDK дописывается в <head>), фрагмент — в нашу обёртку. */
export function miniAppPage(bot: { appCode?: string | null; appName?: string | null }, botUser: { name?: string } | undefined): string {
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
