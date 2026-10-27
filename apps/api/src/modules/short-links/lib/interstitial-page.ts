// Страница-предупреждение перед переходом по короткой ссылке на внешний сайт — как
// interstitialPage в server/routes/shortLinks.js. Внешний адрес не открывается молча: иначе
// /s/xxx на домене Shalter — открытый редирект (фишинг «под видом ссылки Shalter»).

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch as "&"]);
}

export function interstitialPage(target: string): string {
  let host = target;
  try {
    host = new URL(target).host;
  } catch {
    // адрес проверен при создании, но на всякий случай показываем как есть
  }
  const safeTarget = escapeHtml(target);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Переход по ссылке — Shalter</title>
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
<style>
  :root { color-scheme: light dark; --bg: #f4f6f8; --card: #fff; --text: #14181c; --muted: #5b6670; --accent: #1c9bd9; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1418; --card: #182027; --text: #e8edf1; --muted: #9aa6b0; } }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { box-sizing: border-box; width: min(480px, calc(100% - 32px)); background: var(--card); border-radius: 16px; padding: 24px; box-shadow: 0 8px 32px rgb(0 0 0 / 0.08); }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0 0 12px; color: var(--muted); }
  .target { color: var(--text); word-break: break-all; font-family: ui-monospace, monospace; font-size: 14px; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
  a.btn { display: inline-block; padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 600; }
  a.go { background: var(--accent); color: #fff; }
  a.back { color: var(--accent); }
</style>
</head>
<body>
<main>
  <h1>Переход на внешний сайт</h1>
  <p>Ссылка ведёт на <strong>${escapeHtml(host)}</strong> — это не Shalter. Не вводите там пароль от Shalter.</p>
  <p class="target">${safeTarget}</p>
  <div class="actions">
    <a class="btn go" href="${safeTarget}" rel="noopener noreferrer nofollow">Перейти</a>
    <a class="btn back" href="/">Открыть Shalter</a>
  </div>
</main>
</body>
</html>`;
}
