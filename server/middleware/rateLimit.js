const rateLimit = require("express-rate-limit");

// A flat-file, single-process app on modest hardware has no infrastructure
// (CDN/WAF/load balancer) absorbing a request flood before it reaches Node —
// this is the app-level backstop. It won't stop a real distributed attack
// (that needs infra in front, e.g. nginx's own limit_req, Cloudflare, etc.)
// but it blunts the common case: one client hammering the API, accidentally
// (a runaway retry loop) or on purpose.
function jsonHandler(req, res) {
  res.status(429).json({ error: "Слишком много запросов, попробуйте позже" });
}

// General ceiling across all API routes.
//
// It used to be 300 per 5 minutes, described as "generous relative to real
// usage". It wasn't: one open tab spends ~220 of that on its own polls before
// the user does anything (chat list 20, messages 20, typing 60, incoming calls
// 120), so a second tab tripped "слишком много запросов" during ordinary use.
// The polls themselves have been cut back to catch-up cadences now that the
// socket carries typing and incoming calls, but the ceiling was also simply set
// below what the app needs — a limiter that fires on normal use isn't
// protecting anything, it's just breaking the product.
//
// Both ceilings are env-overridable: what counts as "generous" depends on how
// many people share an egress IP behind the deployment (an office or a mobile
// carrier NAT all arrive as one client here), and an automated test suite
// naturally blows through an auth limit meant for humans.
const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT) || 3000;
const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT) || 20;

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: API_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

// Login/register are the routes worth limiting tighter than the rest: this
// is what stops credential stuffing / password-guessing floods specifically,
// on top of the general ceiling above.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: AUTH_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

module.exports = { apiLimiter, authLimiter };
