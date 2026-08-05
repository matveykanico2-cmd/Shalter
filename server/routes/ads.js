const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { getUser, findUserByPhone, grantAdsDays, revokeAds, updateUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { isSafeUrl } = require("../lib/sanitizeAttachments");

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
    if (admin.id === req.uid) return res.status(400).json({ error: "Вы уже администратор Shalter" });

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
    if (me.phone !== ADMIN_PHONE) return res.status(403).json({ error: "Недостаточно прав" });

    const { userId, active, days } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = active !== false;
    if (grant) await grantAdsDays(userId, days ?? ADS_GRANT_DAYS);
    else await revokeAds(userId);

    const chat = await findOrCreateDm(req.uid, userId);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      grant
        ? `📢 Вам выдан кабинет рекламы на ${days ?? ADS_GRANT_DAYS} дней! Настройте объявление в Настройки → Реклама.`
        : "Ваш кабинет рекламы был отключён администрацией."
    );
    res.json({ user: publicUser(await getUser(userId)) });
  })
);

module.exports = router;
