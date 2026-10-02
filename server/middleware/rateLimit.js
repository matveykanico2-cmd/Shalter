const rateLimit = require("express-rate-limit");

function jsonHandler(req, res) {
  res.status(429).json({ error: "Слишком много запросов, попробуйте позже" });
}

const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT) || 3000;
const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT) || 20;

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: API_RATE_LIMIT,
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
