const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { hasAdminSection } = require("../lib/adminAccess");
const { getUser, findUserByPhone, grantAdsDays, revokeAds, updateUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { getActiveDonationLink } = require("../lib/autoPayment");
const { createPendingOrder } = require("../data/pendingOrders");
const { notifyAdminOfReview } = require("../lib/adReview");

const AD_ATTACHMENT_KINDS = new Set(["image", "video", "file"]);
const MAX_AD_ATTACHMENTS = 6;

function sanitizeAdAttachment(a) {
  if (!a || !AD_ATTACHMENT_KINDS.has(a.kind) || !isSafeUrl(a.url)) return null;
  const out = { kind: a.kind, url: a.url };
  if (a.name !== undefined) out.name = String(a.name).slice(0, 300);
  if (a.size !== undefined) out.size = Number.isFinite(a.size) ? a.size : undefined;
  return out;
}

function sanitizeAdAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_AD_ATTACHMENTS).map(sanitizeAdAttachment).filter(Boolean);
}

const ADS_PRICE_RUB = 20;
const ADS_GRANT_DAYS = 30;
const AD_TEXT_MAX = 200;

const router = express.Router();
router.use(requireUserId);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    res.json({
      isAdsActive: !!me.isAdsActive,
      adsUntil: me.adsUntil,
      adsForever: !!me.adsForever,
      adText: me.adText,
      adUrl: me.adUrl,
      adAttachments: me.adAttachments,
      priceRub: ADS_PRICE_RUB,
    });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });

    if (admin.id === req.uid) {
      await grantAdsDays(req.uid, ADS_GRANT_DAYS);
      const chat = await findOrCreateDm(req.uid, req.uid);
      await sendMessageAndBroadcast(
        chat,
        req.uid,
        `📢 Вам выдан кабинет рекламы на ${ADS_GRANT_DAYS} дней! Настройте объявление в Настройки → Реклама.`
      );
      return res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE, priceRub: ADS_PRICE_RUB, delivered: true });
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: req.uid, kind: "ads", amountRub: ADS_PRICE_RUB });
      return res.json({ code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: ADS_PRICE_RUB });
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `📢 Хочу оформить кабинет рекламы на ${ADS_GRANT_DAYS} дней за ${ADS_PRICE_RUB}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE, priceRub: ADS_PRICE_RUB });
  })
);

router.put(
  "/content",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!me.isAdsActive) return res.status(403).json({ error: "Кабинет рекламы не активен" });

    const { text, url, attachments } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: "Введите текст объявления" });
    if (url && !/^https?:\/\//.test(url)) return res.status(400).json({ error: "Ссылка должна начинаться с http:// или https://" });

    const updated = await updateUser(req.uid, {
      adText: text.trim().slice(0, AD_TEXT_MAX),
      adUrl: url?.trim() || null,
      adAttachments: sanitizeAdAttachments(attachments),
    });
    res.json({ user: publicUser(updated) });
  })
);

router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me.phone)) return res.status(403).json({ error: "Недостаточно прав" });

    const { userId, active, days, forever } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = active !== false;
    const dayCount = Number(days) > 0 ? Math.floor(Number(days)) : ADS_GRANT_DAYS;
    if (grant) await grantAdsDays(userId, forever ? null : dayCount);
    else await revokeAds(userId);

    const chat = await findOrCreateDm(req.uid, userId);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      grant
        ? `📢 Вам выдан кабинет рекламы${forever ? " навсегда" : ` на ${dayCount} дней`}! Настройте объявление в Настройки → Реклама.`
        : "Ваш кабинет рекламы был отключён администрацией."
    );
    res.json({ user: publicUser(await getUser(userId)) });
  })
);

const campaigns = require("../data/adCampaigns");
const { balanceOf, spendStars } = require("../data/stars");

const PLACEMENTS = { chats: "Верх списка чатов", chat: "Внутри чата (сверху)", discover: "Каталог каналов", profile: "Своя страница профиля" };
const MAX_TEXT = 200;

// Body may carry `placements: [...]` (several places) or legacy `placement: "id"`.
// Returns the valid ids, or null when the body names none.
function pickPlacements(body) {
  const raw = Array.isArray(body?.placements) ? body.placements : body?.placement != null ? [body.placement] : [];
  const valid = raw.filter((p) => PLACEMENTS[p]);
  return valid.length ? valid : null;
}

function publicCampaign(c) {
  return { id: c.id, title: c.title, text: c.text, url: c.url, imageUrl: c.imageUrl };
}

async function ownCampaign(req, res) {
  const c = campaigns.get(req.params.id);
  if (!c || c.ownerId !== req.uid) {
    res.status(404).json({ error: "Кампания не найдена" });
    return null;
  }
  return c;
}

router.get(
  "/campaigns",
  asyncRoute(async (req, res) => {
    res.json({
      campaigns: campaigns.listByOwner(req.uid),
      balanceStars: balanceOf(req.uid),
      placements: PLACEMENTS,
      cpmMin: campaigns.CPM_MIN,
    });
  })
);

router.post(
  "/campaigns",
  asyncRoute(async (req, res) => {
    const text = String(req.body?.text ?? "").trim().slice(0, MAX_TEXT);
    if (!text) return res.status(400).json({ error: "Напишите текст объявления" });
    const placement = pickPlacements(req.body) ?? ["discover"];
    const created = campaigns.create({
      ownerId: req.uid,
      title: String(req.body?.title ?? "").trim().slice(0, 60),
      text,
      url: String(req.body?.url ?? "").trim().slice(0, 300) || null,
      imageUrl: String(req.body?.imageUrl ?? "").trim() || null,
      placement,
      cpmStars: Number(req.body?.cpmStars) || 20,
    });
    await notifyAdminOfReview(created, req.uid);
    res.json({ campaign: created });
  })
);

router.patch(
  "/campaigns/:id",
  asyncRoute(async (req, res) => {
    const c = await ownCampaign(req, res);
    if (!c) return;
    const patch = {};
    if (typeof req.body?.title === "string") patch.title = req.body.title.trim().slice(0, 60);
    if (typeof req.body?.text === "string") patch.text = req.body.text.trim().slice(0, MAX_TEXT);
    if (typeof req.body?.url === "string") patch.url = req.body.url.trim().slice(0, 300) || null;
    if (typeof req.body?.imageUrl === "string") patch.imageUrl = req.body.imageUrl.trim() || null;
    const placements = pickPlacements(req.body);
    if (placements) patch.placement = placements;
    if (Number.isFinite(Number(req.body?.cpmStars))) patch.cpmStars = Math.max(campaigns.CPM_MIN, Number(req.body.cpmStars));
    const touchesCreative = "text" in patch || "url" in patch || "imageUrl" in patch;
    if (touchesCreative && c.status !== "review") {
      patch.status = "review";
      patch.rejectReason = null;
    }
    const updated = campaigns.update(c.id, patch);
    if (patch.status === "review") await notifyAdminOfReview(updated, req.uid);
    res.json({ campaign: updated });
  })
);

router.delete(
  "/campaigns/:id",
  asyncRoute(async (req, res) => {
    const c = await ownCampaign(req, res);
    if (!c) return;
    campaigns.remove(c.id);
    res.json({ ok: true });
  })
);

router.post(
  "/campaigns/:id/budget",
  asyncRoute(async (req, res) => {
    const c = await ownCampaign(req, res);
    if (!c) return;
    const stars = Math.floor(Number(req.body?.stars) || 0);
    if (stars <= 0) return res.status(400).json({ error: "Сколько звёзд добавить?" });
    if (!spendStars(req.uid, stars)) return res.status(402).json({ error: "Не хватает звёзд на балансе" });
    const updated = campaigns.update(c.id, { budgetStars: c.budgetStars + stars });
    res.json({ campaign: updated, balanceStars: balanceOf(req.uid) });
  })
);

router.post(
  "/campaigns/:id/status",
  asyncRoute(async (req, res) => {
    const c = await ownCampaign(req, res);
    if (!c) return;
    const want = req.body?.status;

    if (want === "review") {
      if (!c.text.trim()) return res.status(400).json({ error: "Пустое объявление не проверяют" });
      const updated = campaigns.update(c.id, { status: "review", rejectReason: null });
      await notifyAdminOfReview(updated, req.uid);
      return res.json({ campaign: updated });
    }
    if (want === "paused") return res.json({ campaign: campaigns.update(c.id, { status: "paused" }) });
    if (want === "active") {
      if (c.status !== "paused" && c.status !== "finished") {
        return res.status(400).json({ error: "Сначала отправьте объявление на проверку" });
      }
      if (c.remainingStars <= 0) return res.status(402).json({ error: "Бюджет израсходован — пополните его" });
      return res.json({ campaign: campaigns.update(c.id, { status: "active" }) });
    }
    res.status(400).json({ error: "Неизвестное состояние" });
  })
);

router.get(
  "/campaigns/:id/stats",
  asyncRoute(async (req, res) => {
    const c = await ownCampaign(req, res);
    if (!c) return;
    res.json({ campaign: c, daily: campaigns.daily(c.id) });
  })
);

router.get(
  "/serve",
  asyncRoute(async (req, res) => {
    const placement = PLACEMENTS[req.query.placement] ? req.query.placement : "discover";
    const c = campaigns.pickForPlacement(placement, req.uid);
    if (!c) return res.json({ ad: null });
    campaigns.recordImpression(c.id, c.cpmStars);
    res.json({ ad: publicCampaign(c) });
  })
);

router.post(
  "/click/:id",
  asyncRoute(async (req, res) => {
    const c = campaigns.get(req.params.id);
    if (!c) return res.status(404).json({ error: "not found" });
    campaigns.recordClick(c.id);
    res.json({ ok: true, url: c.url });
  })
);

async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!hasAdminSection(me, "moderation")) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

router.get(
  "/review",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const list = campaigns.listForReview();
    const withOwners = await Promise.all(
      list.map(async (c) => {
        const owner = await getUser(c.ownerId);
        return { ...c, owner: owner ? { id: owner.id, name: owner.name, username: owner.username || null } : { id: c.ownerId } };
      })
    );
    res.json({ campaigns: withOwners, placements: PLACEMENTS });
  })
);

router.post(
  "/review/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const c = campaigns.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Кампания не найдена" });
    const approve = req.body?.approve !== false;
    const reason = String(req.body?.reason ?? "").trim().slice(0, 300);
    if (!approve && !reason) return res.status(400).json({ error: "Укажите причину отказа — её увидит рекламодатель" });

    const updated = campaigns.update(c.id, approve ? { status: "paused", rejectReason: null } : { status: "rejected", rejectReason: reason });

    try {
      const chat = await findOrCreateDm(c.ownerId, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        approve
          ? `✅ Объявление «${c.title || c.text.slice(0, 30)}» проверено и допущено к показу.\n\nВключите его в кабинете рекламы, когда будете готовы.`
          : `⛔ Объявление «${c.title || c.text.slice(0, 30)}» отклонено.\nПричина: ${reason}\n\nИсправьте текст и отправьте на проверку снова.`
      );
    } catch (err) {
      console.error("ad review notice failed:", err);
    }
    res.json({ campaign: updated });
  })
);

module.exports = router;
