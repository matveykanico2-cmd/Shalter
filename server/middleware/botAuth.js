const { asyncRoute } = require("./errors");
const { getBotByToken } = require("../data/bots");

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
