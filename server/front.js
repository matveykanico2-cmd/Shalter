// Общая обработка каждого запроса до маршрутов: заголовки безопасности, сжатие,
// cookie, JSON-тело, лимиты запросов, Cache-Control для API и ответ на ошибки этих
// шагов (битый JSON, слишком большое тело). Отдельное Express 4-приложение, потому что
// его подключают оба бэкенда: server/app.js и каркас NestJS (apps/api/src/legacy/front.middleware.ts),
// маршруты которого стоят раньше старого приложения. Через Nest запрос потом может
// дойти и до старого приложения, а тело и счётчики лимитов второй раз трогать нельзя —
// поэтому запрос, уже прошедший эти шаги, пропускает их целиком.
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const { errorHandler } = require("./middleware/errors");
const { apiLimiter, authLimiter } = require("./middleware/rateLimit");

// Чьему X-Forwarded-For верить. Всегда — одному ближайшему прокси (nginx перед сервером),
// как раньше с "trust proxy" 1. SHALTER_TRUSTED_PROXIES=1.2.3.4,5.6.7.8 — ещё и этим адресам
// (свои прокси Shalter, apps/proxy): тогда адрес клиента — тот, что дописал такой прокси,
// а не сам прокси, и лимиты попыток входа у его пользователей свои, а не один на всех.
// Чужой прокси подделать адрес не может: его адреса в списке нет.
const TRUSTED_PROXIES = new Set(
  (process.env.SHALTER_TRUSTED_PROXIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
function trustProxy(addr, i) {
  return i < 1 || TRUSTED_PROXIES.has(String(addr).replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, ""));
}

const front = express();
front.set("trust proxy", trustProxy);

front.use((req, res, next) => {
  if (req.shalterFront) return next("router");
  req.shalterFront = true;
  next();
});

front.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

if (!process.env.DISABLE_APP_GZIP) {
  front.use(
    compression({
      level: 6,
      filter: (req, res) => !req.path.startsWith("/dist/") && compression.filter(req, res),
    })
  );
}

front.use(cookieParser());
front.use(express.json({ limit: "25mb" }));

front.use("/api", apiLimiter);
// Ответы API всегда сверяются с сервером: иначе WebView/Safari мог отдать список
// чатов из своего кэша, и новое появлялось только после перезагрузки. Маршруты,
// которым кэш нужен (файлы, аватарки), ставят свой Cache-Control поверх этого.
front.use("/api", (req, res, next) => {
  if (req.method === "GET") res.set("Cache-Control", "no-cache");
  next();
});
for (const route of [
  "/api/auth/login-email",
  "/api/auth/register-email",
  "/api/auth/code/start",
  "/api/auth/code/verify",
  "/api/auth/2fa/login",
  "/api/auth/recover",
  "/api/auth/change-password",
  "/api/auth/email",
  "/api/auth/passkey/login",
  "/api/auth/guest",
]) {
  front.use(route, authLimiter);
}

front.use(errorHandler);

module.exports = { front, trustProxy };
