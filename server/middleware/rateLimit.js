const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { getCurrentUserId } = require("./auth");

function jsonHandler(req, res) {
  res.status(429).json({ error: "Слишком много запросов, попробуйте позже" });
}

const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT) || 3000;
const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT) || 20;

// Лимит API — на пользователя, а не на IP: за прокси/CDN (Traefik, Cloudflare)
// или в одной сети (офис, мобильный оператор с общим NAT) у многих людей один
// адрес, и общий счётчик кончался на всех сразу — приложение «замирало» до
// конца окна. Сессия проверяется по базе (getCurrentUserId), подделать ключ
// нельзя; без входа — по IP.
function apiKey(req) {
  let uid = null;
  try {
    uid = getCurrentUserId(req);
  } catch {}
  return uid ? `u:${uid}` : `ip:${ipKeyGenerator(req.ip || "")}`;
}

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: API_RATE_LIMIT,
  keyGenerator: apiKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: AUTH_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

module.exports = { apiLimiter, authLimiter };
