const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { SHALTER_AI_ID, ensureShalterAiAccount } = require("../data/shalterAiBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");
const { WELCOME, stopShalterAi, quotaFor } = require("../lib/shalterAi");
const { PLANS, CHOICES, normalizeAiSettings } = require("../lib/aiPlans");
const { getSettings, updateSettings } = require("../data/settings");

const router = express.Router();
router.use(requireUserId);

// Чат с Shalter AI (меню → «Shalter AI»): создаём при первом открытии и здороваемся.
router.post(
  "/chat",
  asyncRoute(async (req, res) => {
    ensureShalterAiAccount();
    const chat = await findOrCreateDm(req.uid, SHALTER_AI_ID);
    const existing = await listMessages(chat.id, req.uid);
    if (existing.length === 0) await sendMessageAndBroadcast(chat, SHALTER_AI_ID, WELCOME);
    res.json({ chatId: chat.id });
  })
);

// Крутилки и тариф: настройки ответов, лимиты и сколько потрачено сегодня.
async function aiState(uid) {
  const { plan, settings, usage } = await quotaFor(uid);
  return { settings, plan, plans: Object.values(PLANS), usage, choices: CHOICES };
}

router.get(
  "/settings",
  asyncRoute(async (req, res) => {
    res.json(await aiState(req.uid));
  })
);

router.patch(
  "/settings",
  asyncRoute(async (req, res) => {
    const { plan } = await quotaFor(req.uid);
    const current = (await getSettings(req.uid))?.ai ?? {};
    const patch = req.body ?? {};
    if (patch.mode === "smart" && !plan.modes.includes("smart")) {
      return res.status(403).json({ error: "Умный режим доступен в Premium" });
    }
    const next = normalizeAiSettings({ ...current, ...patch }, plan);
    await updateSettings(req.uid, { ai: next });
    res.json(await aiState(req.uid));
  })
);

router.post(
  "/stop",
  asyncRoute(async (req, res) => {
    res.json({ stopped: stopShalterAi(String(req.body?.chatId ?? ""), req.uid) });
  })
);

module.exports = router;
