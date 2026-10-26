const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { isAdminPhone } = require("../config");
const { getUser, grantPremiumDays, grantAdsDays, grantBusinessDays } = require("../data/users");
const { addStars, balanceOf } = require("../data/stars");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { publicUser } = require("../data/sanitize");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { getPricing } = require("../data/pricing");

const crypto = require("crypto");
const promoCodes = require("../data/promoCodes");

const router = express.Router();

async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!me || !isAdminPhone(me.phone)) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

function validateConfig(prize, config, res) {
  const pricing = getPricing();
  const premiumPlans = pricing.premiumPlans || [];

  if (prize === "premium") {
    const days = Number(config?.days);
    if (!Number.isInteger(days) || days <= 0) {
      res.status(400);
      return { error: "Укажите количество дней Premium" };
    }
    return null;
  }
  if (prize === "stars") {
    const amount = Number(config?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      res.status(400);
      return { error: "Укажите количество звёзд" };
    }
    return null;
  }
  if (prize === "ads") {
    const days = Number(config?.days);
    if (!Number.isInteger(days) || days <= 0) {
      res.status(400);
      return { error: "Укажите количество дней кабинета рекламы" };
    }
    return null;
  }
  if (prize === "business") {
    const days = Number(config?.days);
    if (!Number.isInteger(days) || days <= 0) {
      res.status(400);
      return { error: "Укажите количество дней бизнеса" };
    }
    return null;
  }
  res.status(400);
  return { error: `Неизвестный тип подарка: ${prize}` };
}

router.use(requireUserId);

// Admin: list all promo codes
router.get(
  "/admin",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const list = promoCodes.list();
    const users = list.map((p) => p.createdBy).filter(Boolean);
    const owners = {};
    for (const id of users) {
      const u = await getUser(id);
      owners[id] = u ? { id: u.id, name: u.name } : null;
    }
    res.json({
      codes: list.map((p) => ({
        ...p,
        createdByName: owners[p.createdBy]?.name ?? "неизвестно",
      })),
    });
  })
);

// Admin: create a promo code
router.post(
  "/admin/create",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { code, prize, config, usesTotal } = req.body ?? {};

    const err = validateConfig(prize, config, res);
    if (err) return res.status(err.status || 400).json(err);

    try {
      const created = promoCodes.create({
        code: code || undefined,
        prize,
        config,
        usesTotal,
        createdBy: req.uid,
      });
      res.json({ code: created });
    } catch (err) {
      if (err?.code === "SQLITE_CONSTRAINT") {
        return res.status(409).json({ error: `Код ${code.toUpperCase()} уже существует` });
      }
      throw err;
    }
  })
);

// Admin: delete a promo code
router.delete(
  "/admin/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const existing = promoCodes.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Код не найден" });
    promoCodes.deleteCode(req.params.id);
    res.json({ ok: true });
  })
);

// Admin: set usesTotal on a code
router.patch(
  "/admin/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const existing = promoCodes.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Код не найден" });
    if (typeof req.body?.usesTotal !== "undefined") {
      promoCodes.setUsesTotal(req.params.id, req.body.usesTotal);
    }
    res.json({ code: promoCodes.getById(req.params.id) });
  })
);

// User: redeem a promo code
router.post(
  "/redeem",
  asyncRoute(async (req, res) => {
    const code = String(req.body?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "Введите код" });

    const result = promoCodes.redeem(code, req.uid);
    if (result.error) return res.status(400).json({ error: result.error });

    const { config } = result;
    const me = await getUser(req.uid);

    let message = "";

    if (config.type === "premium") {
      await grantPremiumDays(req.uid, config.days);
      message = `🎉 Вам выдан Shalter Premium на ${config.days} дней по промокоду!`;
    } else if (config.type === "stars") {
      await addStars(req.uid, config.amount);
      message = `🌟 Вам начислено ${config.amount} звёзд по промокоду!`;
    } else if (config.type === "ads") {
      await grantAdsDays(req.uid, config.days);
      message = `📢 Вам выдан кабинет рекламы на ${config.days} дней по промокоду!`;
    } else if (config.type === "business") {
      await grantBusinessDays(req.uid, config.days);
      message = `💼 Вам выдан Shalter для бизнеса на ${config.days} дней по промокоду!`;
    }

    const chat = await findOrCreateDm(req.uid, req.uid);
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, message);

    const updated = publicUser(await getUser(req.uid));
    broadcastToUsers([req.uid], { type: "self:updated", user: updated });

    res.json({ delivered: true, message, balance: config.type === "stars" ? balanceOf(req.uid) : undefined });
  })
);

// User: info about the promo code entry
router.get(
  "/info",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    res.json({ isAdmin: isAdminPhone(me?.phone ?? ""), balance: me?.stars ?? 0 });
  })
);

module.exports = router;
