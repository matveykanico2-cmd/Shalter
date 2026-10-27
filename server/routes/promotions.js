const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser, grantPremiumDays, grantAdsDays, grantBusinessDays } = require("../data/users");
const { addStars, balanceOf } = require("../data/stars");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { publicUser } = require("../data/sanitize");
const { hasAdminSection } = require("../lib/adminAccess");
const promoCodes = require("../data/promoCodes");

const router = express.Router();

const MAX_DAYS = 3650;
const MAX_STARS = 1_000_000;
const MAX_USES = 1_000_000;
const CODE_RE = /^[A-Z0-9_-]{4,32}$/;

// Промокод раздаёт то, что иначе продаётся, — поэтому раздел «Цены».
async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!hasAdminSection(me, "pricing")) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

function intIn(value, max) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

// Конфиг собирается здесь из prize, а не берётся из тела как есть.
function buildConfig(prize, raw) {
  if (prize === "stars") {
    const amount = intIn(raw?.amount, MAX_STARS);
    return amount ? { config: { type: "stars", amount } } : { error: "Укажите количество звёзд" };
  }
  const label = { premium: "дней Premium", ads: "дней кабинета рекламы", business: "дней бизнеса" }[prize];
  if (!label) return { error: "Неизвестный тип подарка" };
  const days = intIn(raw?.days, MAX_DAYS);
  return days ? { config: { type: prize, days } } : { error: `Укажите количество ${label}` };
}

// undefined — поле не передано, null — без лимита, false — ошибка.
function parseUsesTotal(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return intIn(value, MAX_USES) ?? false;
}

router.use(requireUserId);

router.get(
  "/admin",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const codes = promoCodes.list();
    const names = new Map();
    for (const id of new Set(codes.map((p) => p.createdBy))) names.set(id, (await getUser(id))?.name ?? "неизвестно");
    res.json({ codes: codes.map((p) => ({ ...p, createdByName: names.get(p.createdBy) })) });
  })
);

router.post(
  "/admin/create",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { prize } = req.body ?? {};
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (code && !CODE_RE.test(code)) {
      return res.status(400).json({ error: "Код — от 4 до 32 символов: латинские буквы, цифры, _ и -" });
    }
    const built = buildConfig(prize, req.body?.config);
    if (built.error) return res.status(400).json({ error: built.error });
    const usesTotal = parseUsesTotal(req.body?.usesTotal);
    if (usesTotal === false) return res.status(400).json({ error: "Лимит активаций — целое число больше нуля" });

    const created = promoCodes.create({ code, prize, config: built.config, usesTotal, createdBy: req.uid });
    if (!created) return res.status(409).json({ error: `Код ${code} уже существует` });
    res.json({ code: created });
  })
);

router.delete(
  "/admin/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!promoCodes.getById(req.params.id)) return res.status(404).json({ error: "Код не найден" });
    promoCodes.deleteCode(req.params.id);
    res.json({ ok: true });
  })
);

router.patch(
  "/admin/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!promoCodes.getById(req.params.id)) return res.status(404).json({ error: "Код не найден" });
    const usesTotal = parseUsesTotal(req.body?.usesTotal);
    if (usesTotal === false) return res.status(400).json({ error: "Лимит активаций — целое число больше нуля" });
    if (usesTotal !== undefined) promoCodes.setUsesTotal(req.params.id, usesTotal);
    res.json({ code: promoCodes.getById(req.params.id) });
  })
);

router.post(
  "/redeem",
  asyncRoute(async (req, res) => {
    const code = String(req.body?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "Введите код" });

    const result = promoCodes.redeem(code, req.uid);
    if (result.error) return res.status(400).json({ error: result.error });

    const { config } = result;
    let message;
    if (config.type === "premium") {
      await grantPremiumDays(req.uid, config.days);
      message = `🎉 Вам выдан Shalter Premium на ${config.days} дн. по промокоду!`;
    } else if (config.type === "stars") {
      addStars(req.uid, config.amount);
      message = `🌟 Вам начислено ${config.amount} ⭐ по промокоду!`;
    } else if (config.type === "ads") {
      await grantAdsDays(req.uid, config.days);
      message = `📢 Вам выдан кабинет рекламы на ${config.days} дн. по промокоду!`;
    } else {
      await grantBusinessDays(req.uid, config.days);
      message = `💼 Вам выдан Shalter для бизнеса на ${config.days} дн. по промокоду!`;
    }

    // Как покупка Premium за звёзды: запись в «Избранном».
    const chat = await findOrCreateDm(req.uid, req.uid);
    await sendMessageAndBroadcast(chat, req.uid, message);
    broadcastToUsers([req.uid], { type: "self:updated", user: publicUser(await getUser(req.uid)) });

    res.json({ delivered: true, message, balance: balanceOf(req.uid) });
  })
);

module.exports = router;
