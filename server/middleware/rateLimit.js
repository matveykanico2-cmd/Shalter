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

// General ceiling across all API routes. Generous relative to real usage —
// the chat list, message list, and typing indicator poll every 15s/15s/5s
// per open tab (WS covers the live-update case; see chatView.js/chatList.js)
// — so normal multi-tab usage stays well under this.
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

// Login/register are the routes worth limiting tighter than the rest: this
// is what stops credential stuffing / password-guessing floods specifically,
// on top of the general ceiling above.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

module.exports = { apiLimiter, authLimiter };
