const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getUser, findUserByPhone, grantAdsDays, revokeAds, updateUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { isConnected: isDonationAlertsConnected, getDonationPageUrl } = require("../lib/donationAlerts");
const { createPendingOrder } = require("../data/pendingOrders");
// Очередь проверки общая с маркетом (routes/market.js → «Рекламировать»).
const { notifyAdminOfReview } = require("../lib/adReview");

// Ads get a small gallery of attachments, image/video/file only — no voice/
// video-note/location/contact/poll, none of which make sense on a
// promotional banner.
const AD_ATTACHMENT_KINDS = new Set(["image", "video", "file"]);
const MAX_AD_ATTACHMENTS = 6;

// Same "never trust client-authored JSON" reasoning as sanitizeAttachments —
// this is a standalone (rather than shared) check since ads don't need the
// location/contact/poll meta handling that function also does.
function sanitizeAdAttachment(a) {
  if (!a || !AD_ATTACHMENT_KINDS.has(a.kind) || !isSafeUrl(a.url)) return null;
  const out = { kind: a.kind, url: a.url };
  if (a.name !== undefined) out.name = String(a.name).slice(0, 300);
  if (a.size !== undefined) out.size = Number.isFinite(a.size) ? a.size : undefined;
  return out;
}

// Invalid entries are dropped rather than failing the whole save — same
// "recovered is more useful than 400'd" call as sanitizeAttachments.js makes
// for message attachments.
function sanitizeAdAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_AD_ATTACHMENTS).map(sanitizeAdAttachment).filter(Boolean);
}

// "Кабинет рекламы" — 20₽/месяц, same no-payment-gateway trust model as
// Premium (server/routes/premium.js): buying opens a DM with whoever holds
// ADMIN_PHONE, the admin grants by hand once the transfer actually lands.
// While active, the buyer can set one promotional text/link that shows on
// their public profile (see profileDialog.js's ad banner).
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

    // Same "nobody to ask" reasoning as premium.js/gifts.js's /request — the
    // admin activates their own ad cabinet immediately instead of messaging
    // themselves to wait for their own confirmation.
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

    // Same as premium.js's /request.
    if (isDonationAlertsConnected()) {
      const donationUrl = getDonationPageUrl();
      if (donationUrl) {
        const order = await createPendingOrder({ userId: req.uid, kind: "ads", amountRub: ADS_PRICE_RUB });
        return res.json({ code: order.code, donationUrl, amountRub: ADS_PRICE_RUB });
      }
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

// Owner sets/edits their ad content — only while active, so an expired
// subscription's old text doesn't linger displayed anywhere (see rowToUser's
// isAdsActive computation; the profile banner checks that flag, not just
// "adText is non-empty").
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

// Grants (or revokes) the ad cabinet for another account — same
// ADMIN_PHONE-holder-only gate as Premium's /grant.
router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me.phone)) return res.status(403).json({ error: "Недостаточно прав" });

    const { userId, active, days, forever } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = active !== false;
    // Same `forever` handling (and the same fix) as premium.js's /grant —
    // grantAdsDays reads null as permanent, which `days ?? ADS_GRANT_DAYS`
    // used to make unreachable.
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

// ── Рекламный кабинет для бизнеса ───────────────────────────────────────────
//
// Что здесь есть и почему именно это.
//
// Кампании, а не одно объявление: у бизнеса обычно идёт несколько разных — на
// новинку, на распродажу, на набор сотрудников, — и у каждой свои деньги и своя
// статистика. Одно поле «текст рекламы» этого не выражает.
//
// Деньги — звёзды, уже существующая валюта приложения. Списывается за показы,
// цена задаётся за тысячу (CPM): так объявление в маленьком канале стоит
// столько, сколько стоит, а не «как повезёт».
//
// Модерация обязательна и до первого показа: реклама — единственное место, где
// один человек платит за то, чтобы его текст увидели незнакомые люди, и пускать
// это без проверки нельзя. Проверяет тот же администратор, что и жалобы.
//
// Чего здесь намеренно НЕТ: нацеливания на человека. Ни по переписке, ни по
// контактам, ни по «интересам», собранным из поведения. Выбрать можно место
// показа (каталог каналов или своя страница) — и всё. Это осознанное
// ограничение, а не незаконченная работа: рекламный кабинет, который умеет
// целиться в человека, требует слежки за ним, а мессенджер, который следит за
// своими людьми, не нужен никому.
const campaigns = require("../data/adCampaigns");
const { balanceOf, spendStars } = require("../data/stars");

// Куда объявление может попасть. "chats" — первая строка списка чатов, над
// всеми разговорами. Показывается она лично: объявление приезжает запросом
// самого читателя, нигде не хранится и ни в чей чужой список не попадает, —
// поэтому её видит только тот, кому её показали, и стоит она ровно один показ.
const PLACEMENTS = { chats: "Верх списка чатов", discover: "Каталог каналов", profile: "Своя страница профиля" };
const MAX_TEXT = 200;

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

// Список кампаний кабинета + баланс звёзд, чтобы экран не делал второй запрос
// ради одной цифры.
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
    const placement = PLACEMENTS[req.body?.placement] ? req.body.placement : "discover";
    const created = campaigns.create({
      ownerId: req.uid,
      title: String(req.body?.title ?? "").trim().slice(0, 60),
      text,
      url: String(req.body?.url ?? "").trim().slice(0, 300) || null,
      imageUrl: String(req.body?.imageUrl ?? "").trim() || null,
      placement,
      cpmStars: Number(req.body?.cpmStars) || 20,
    });
    // Создана — значит уже на проверке (см. adCampaigns.create): отдельного
    // «отправить на проверку» после создания больше нет.
    await notifyAdminOfReview(created, req.uid);
    res.json({ campaign: created });
  })
);

router.patch(
  "/campaigns/:id",
  asyncRoute(async (req, res) => {
    const c = await ownCampaign(req, res);
    if (!c) return;
    // Изменённое объявление снова уходит на проверку: иначе одобренный текст
    // можно было бы подменить на любой другой сразу после одобрения.
    const patch = {};
    if (typeof req.body?.title === "string") patch.title = req.body.title.trim().slice(0, 60);
    if (typeof req.body?.text === "string") patch.text = req.body.text.trim().slice(0, MAX_TEXT);
    if (typeof req.body?.url === "string") patch.url = req.body.url.trim().slice(0, 300) || null;
    if (typeof req.body?.imageUrl === "string") patch.imageUrl = req.body.imageUrl.trim() || null;
    if (PLACEMENTS[req.body?.placement]) patch.placement = req.body.placement;
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

// Пополнение бюджета: звёзды уходят с баланса сразу. Возврата нет и он не
// нужен — неизрасходованный бюджет остаётся в кампании и продолжает работать,
// когда её снова включат.
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

// Запуск, пауза и отправка на проверку — одним маршрутом: это одно и то же
// действие «поменять состояние», и разводить его по трём означало бы трижды
// повторить проверки.
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
      // Включить можно только проверенное. Черновик и отклонённое сначала идут
      // на проверку — на этом и держится смысл модерации.
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

// ── Показ ───────────────────────────────────────────────────────────────────
// Что показать в этом месте. Каждый ответ — это показ: он считается и стоит
// денег, поэтому запрос делается там, где объявление действительно появляется
// на экране, а не «на всякий случай» при загрузке страницы.
router.get(
  "/serve",
  asyncRoute(async (req, res) => {
    const placement = PLACEMENTS[req.query.placement] ? req.query.placement : "discover";
    // Своя же реклама себе не показывается: платить за собственный показ
    // бессмысленно, а в статистике это выглядит как накрутка.
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

// ── Модерация (владелец ADMIN_PHONE) ────────────────────────────────────────
async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!me || !isAdminPhone(me.phone)) {
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
    // Названия мест показа едут вместе с очередью: без них экран проверки
    // показывал бы «discover» вместо «Каталог каналов».
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

    // Одобренная кампания встаёт на паузу, а не запускается сама: включает её
    // владелец, когда сочтёт нужным, — и тогда же начинают тратиться деньги.
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
