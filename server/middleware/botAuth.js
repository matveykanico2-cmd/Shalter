const { asyncRoute } = require("./errors");
const { getBotByToken } = require("../data/bots");

// Bot API auth is a bearer token, not the cookie-based session everything
// else in this app uses — a bot's "developer" is an external script (see
// BOTS.md), which has no browser session to carry.
const requireBotToken = asyncRoute(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing Authorization: Bearer <token>" });

  const bot = await getBotByToken(token);
  if (!bot) return res.status(401).json({ error: "Invalid bot token" });

  req.bot = bot;
  next();
});

module.exports = { requireBotToken };
