const fs = require("fs");
const path = require("path");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { hasAdminSection } = require("../lib/adminAccess");
const { getUser, findUserByPhone, removeReceivedGift, setGiftPinned } = require("../data/users");
const { balanceOf, spendStars, addStars } = require("../data/stars");
const {
  listGifts,
  isOnSale,
  getGift,
  listUserGifts,
  getUserGift,
  setSupply,
  setGiftScene,
  createGift,
  createUserGift,
  updateUserGift,
  deleteUserGift,
  deleteCustomGift,
  hideBuiltin,
  restoreBuiltin,
  conversionValue,
  SUPPLY_MIN,
  SUPPLY_MAX,
} = require("../data/gifts");
const { sanitizeScene, sceneSummaryEmoji } = require("../lib/sanitizeScene");
const { sanitizeGiftBackground } = require("../lib/giftBackground");
const { remaining, issuedCount } = require("../data/giftIssues");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { deliverGift } = require("../lib/deliverGift");
const { getActiveDonationLink } = require("../lib/autoPayment");
const { createPendingOrder } = require("../data/pendingOrders");
const { fetchUploadToTemp, storeGeneratedFile } = require("../lib/uploadTransfer");
const { cutGifBackground } = require("../lib/giftMedia");
const { FILENAME_RE } = require("../lib/serveUpload");

// Куда вести отправителя после подарка: его личка с получателем. При анонимном
// подарке сообщение пишет бот Shalter, но открыть отправителю надо свой чат.
async function senderChatId(result, uid, recipientId) {
  if (result.chat?.memberIds?.includes(uid)) return result.chat.id;
  const dm = await findOrCreateDm(uid, recipientId);
  return dm.id;
}

const router = express.Router();
router.use(requireUserId);

async function resolveAnonymous(req) {
  if (!req.body?.anonymous) return false;
  const me = await getUser(req.uid);
  return !!me?.isPremium;
}

function copiesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "экземпляр";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "экземпляра";
  return "экземпляров";
}

function soldOutError(gift) {
  return gift.supply === 1
    ? `«${gift.name}» распродан — единственный экземпляр уже забрали`
    : `«${gift.name}» распродан — все ${gift.supply} ${copiesWord(gift.supply)} уже разобраны`;
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const gifts = listGifts().map((g) => (g.supply ? { ...g, remaining: remaining(g) } : g));
    res.json({ gifts, balance: balanceOf(req.uid) });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    if (!isOnSale(gift.id)) return res.status(400).json({ error: "Этот подарок больше не продаётся" });
    const recipientId = req.body?.recipientId;
    if (recipientId === req.uid) return res.status(400).json({ error: "Нельзя подарить подарок самому себе" });
    const recipient = recipientId ? await getUser(recipientId) : null;
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });

    if (gift.supply && remaining(gift) <= 0) {
      return res.status(410).json({ error: soldOutError(gift) });
    }

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });

    if (admin.id === req.uid) {
      const result = await deliverGift({ gift, recipientId: recipient.id, fromId: req.uid, announceFromId: req.uid });
      if (!result.ok) return res.status(410).json({ error: soldOutError(gift) });
      return res.json({ chatId: result.chat.id, adminPhone: ADMIN_PHONE, delivered: true, serial: result.serial });
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: req.uid, kind: "gift", giftId: gift.id, recipientId, amountRub: gift.priceRub });
      return res.json({ code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: gift.priceRub });
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `🎁 Хочу подарить ${gift.emoji} «${gift.name}» за ${gift.priceRub}₽ пользователю ${recipient.name}. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

router.post(
  "/deliver",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!hasAdminSection(me, "moderation")) return res.status(403).json({ error: "Недостаточно прав" });

    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    const recipient = await getUser(req.body?.recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });

    const result = await deliverGift({ gift, recipientId: recipient.id, fromId: req.uid, announceFromId: req.uid });
    if (!result.ok) {
      return res.status(410).json({ error: soldOutError(gift) });
    }
    res.json({ user: publicUser(await getUser(recipient.id)), serial: result.serial });
  })
);

router.post(
  "/buy",
  asyncRoute(async (req, res) => {
    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    if (!isOnSale(gift.id)) return res.status(400).json({ error: "Этот подарок больше не продаётся" });
    const recipientId = req.body?.recipientId;
    if (recipientId === req.uid) return res.status(400).json({ error: "Нельзя подарить подарок самому себе" });
    const recipient = recipientId ? await getUser(recipientId) : null;
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });
    if ((recipient.blockedUserIds ?? []).includes(req.uid)) return res.status(403).json({ error: "Пользователь ограничил вам доступ" });
    if (gift.supply && remaining(gift) <= 0) return res.status(410).json({ error: soldOutError(gift) });

    const price = gift.priceStars;
    if (!spendStars(req.uid, price)) {
      return res.status(402).json({
        error: `Не хватает звёзд — нужно ${price.toLocaleString("ru-RU")} ⭐`,
        needStars: price,
        balance: balanceOf(req.uid),
      });
    }

    const background = sanitizeGiftBackground(req.body?.background);
    const anonymous = await resolveAnonymous(req);
    const result = await deliverGift({ gift, recipientId, fromId: req.uid, announceFromId: req.uid, background, anonymous });
    if (!result.ok) {
      addStars(req.uid, price);
      return res.status(410).json({ error: soldOutError(gift), balance: balanceOf(req.uid) });
    }
    res.json({ chatId: await senderChatId(result, req.uid, recipientId), serial: result.serial, delivered: true, balance: balanceOf(req.uid) });
  })
);

router.post(
  "/received/:entryId/convert",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const entry = (me?.giftsReceived ?? []).find((g) => (g.id ? g.id === req.params.entryId : `${g.emoji}|${g.at}` === req.params.entryId));
    if (!entry) return res.status(404).json({ error: "Подарок не найден на вашей полке" });

    if (entry.custom || (!entry.priceStars && entry.priceStars !== undefined)) {
      return res.status(400).json({ error: "Этот подарок нельзя обменять на звёзды" });
    }

    const catalogGift = getGift(entry.giftId ?? "");
    const value = conversionValue(catalogGift ?? { priceRub: entry.priceRub ?? 1, priceStars: entry.priceStars });
    if (!removeReceivedGift(req.uid, req.params.entryId)) {
      return res.status(404).json({ error: "Подарок не найден на вашей полке" });
    }
    const balance = addStars(req.uid, value);
    res.json({ balance, gained: value, user: publicUser(await getUser(req.uid)) });
  })
);

router.delete(
  "/received/:entryId",
  asyncRoute(async (req, res) => {
    if (!removeReceivedGift(req.uid, req.params.entryId)) {
      return res.status(404).json({ error: "Подарок не найден на вашей полке" });
    }
    res.json({ user: publicUser(await getUser(req.uid)) });
  })
);

router.post(
  "/received/:entryId/pin",
  asyncRoute(async (req, res) => {
    if (!setGiftPinned(req.uid, req.params.entryId, req.body?.pinned !== false)) {
      return res.status(404).json({ error: "Подарок не найден на вашей полке" });
    }
    res.json({ user: publicUser(await getUser(req.uid)) });
  })
);

async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!hasAdminSection(me, "giftshop")) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

function parseSupply(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return { error: "Тираж должен быть целым числом" };
  if (n < SUPPLY_MIN || n > SUPPLY_MAX) {
    return { error: `Тираж эксклюзива — от ${SUPPLY_MIN.toLocaleString("ru-RU")} до ${SUPPLY_MAX.toLocaleString("ru-RU")}` };
  }
  return { value: n };
}

router.get(
  "/catalog",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const gifts = listGifts({ includeHidden: true }).map((g) =>
      g.supply ? { ...g, issued: issuedCount(g.id), remaining: remaining(g) } : g
    );
    res.json({ gifts, supplyMin: SUPPLY_MIN, supplyMax: SUPPLY_MAX });
  })
);

router.post(
  "/catalog/:id/supply",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const gift = getGift(req.params.id);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    if (!gift.supply) return res.status(400).json({ error: "У этого подарка нет тиража — он безлимитный" });

    const parsed = parseSupply(req.body?.supply);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const issued = issuedCount(gift.id);
    if (parsed.value < issued) {
      return res.status(409).json({
        error: `Уже выпущено ${issued.toLocaleString("ru-RU")} шт. — тираж нельзя опустить ниже этого числа`,
      });
    }

    const updated = setSupply(gift.id, parsed.value);
    res.json({ gift: { ...updated, issued, remaining: remaining(updated) } });
  })
);

router.post(
  "/catalog/:id/scene",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getGift(req.params.id)) return res.status(404).json({ error: "Подарок не найден" });
    let scene = null;
    if (req.body?.scene != null) {
      scene = sanitizeScene(req.body.scene, { requireLayers: true });
      if (!scene) return res.status(400).json({ error: "Нарисуйте подарок — добавьте хотя бы одну фигуру" });
    }
    const gift = setGiftScene(req.params.id, scene);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    res.json({ gift });
  })
);

function giftUploadFilename(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const filename = url.slice("/uploads/".length);
  return FILENAME_RE.test(filename) ? filename : null;
}

async function processGiftGif(gifUrl) {
  const filename = giftUploadFilename(gifUrl);
  if (!filename) return { error: "Некорректная ссылка на гифку — загрузите файл заново" };

  const sourcePath = await fetchUploadToTemp(filename);
  try {
    const cutPath = await cutGifBackground(sourcePath);
    try {
      return { mediaUrl: await storeGeneratedFile(cutPath) };
    } finally {
      await fs.promises.unlink(cutPath).catch(() => {});
    }
  } catch {
    return { error: "Не удалось обработать гифку — проверьте, что это gif или короткое видео" };
  } finally {
    await fs.promises.unlink(sourcePath).catch(() => {});
  }
}

router.post(
  "/catalog",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { emoji, name, priceStars, premiumDays, supply, exclusive, gifUrl } = req.body ?? {};

    const scene = req.body?.scene === undefined ? null : sanitizeScene(req.body.scene, { requireLayers: true });
    if (req.body?.scene !== undefined && !scene) return res.status(400).json({ error: "Нарисуйте подарок — добавьте хотя бы одну фигуру" });

    if (!String(emoji ?? "").trim()) return res.status(400).json({ error: "Укажите эмодзи подарка" });
    if (!String(name ?? "").trim()) return res.status(400).json({ error: "Укажите название подарка" });
    const price = Number(priceStars);
    if (!Number.isInteger(price) || price < 1) return res.status(400).json({ error: "Цена — целое число от 1 звезды" });

    let supplyValue = null;
    if (exclusive) {
      const parsed = parseSupply(supply);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      supplyValue = parsed.value;
    }

    let mediaUrl;
    if (gifUrl) {
      const result = await processGiftGif(gifUrl);
      if (result.error) return res.status(400).json({ error: result.error });
      mediaUrl = result.mediaUrl;
    }

    const slug =
      String(name)
        .toLowerCase()
        .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 24) || "gift";
    const id = `custom_${slug}_${Date.now().toString(36)}`;

    const gift = createGift({
      id,
      emoji: String(emoji).trim().slice(0, 8),
      name: String(name).trim().slice(0, 60),
      priceStars: price,
      premiumDays: premiumDays === null ? null : Number.isInteger(Number(premiumDays)) ? Number(premiumDays) : 0,
      supply: supplyValue,
      exclusive: !!exclusive,
      mediaUrl,
      scene,
    });
    res.json({ gift });
  })
);

router.delete(
  "/catalog/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const gift = getGift(req.params.id);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });

    if (gift.custom && !gift.ownerId) {
      if (issuedCount(gift.id) === 0) {
        deleteCustomGift(gift.id);
        return res.json({ ok: true, removed: true });
      }
    }

    if (!hideBuiltin(gift.id)) {
      return res.status(400).json({ error: "Не удалось скрыть подарок" });
    }
    res.json({ ok: true, hidden: true });
  })
);

router.post(
  "/catalog/:id/restore",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!restoreBuiltin(req.params.id)) return res.status(404).json({ error: "Скрытый подарок не найден" });
    res.json({ ok: true, gift: getGift(req.params.id) });
  })
);

const MAX_USER_GIFTS = 50;

router.get(
  "/custom",
  asyncRoute(async (req, res) => {
    res.json({ gifts: listUserGifts(req.uid) });
  })
);

router.post(
  "/custom",
  asyncRoute(async (req, res) => {
    const name = String(req.body?.name ?? "").trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: "Назовите подарок" });
    const scene = sanitizeScene(req.body?.scene, { requireLayers: true });
    if (!scene) return res.status(400).json({ error: "Нарисуйте подарок — добавьте хотя бы одну фигуру" });
    if (listUserGifts(req.uid).length >= MAX_USER_GIFTS) {
      return res.status(409).json({ error: `Не больше ${MAX_USER_GIFTS} своих подарков` });
    }
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 20) || "gift";
    const id = `ug_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const gift = createUserGift({ id, ownerId: req.uid, name, scene, emoji: sceneSummaryEmoji(scene) });
    res.json({ gift });
  })
);

router.patch(
  "/custom/:id",
  asyncRoute(async (req, res) => {
    const patch = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: "Назовите подарок" });
      patch.name = name;
    }
    if (req.body?.scene !== undefined) {
      const scene = sanitizeScene(req.body.scene, { requireLayers: true });
      if (!scene) return res.status(400).json({ error: "Нарисуйте подарок — добавьте хотя бы одну фигуру" });
      patch.scene = scene;
      patch.emoji = sceneSummaryEmoji(scene);
    }
    const gift = updateUserGift(req.params.id, req.uid, patch);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    res.json({ gift });
  })
);

router.delete(
  "/custom/:id",
  asyncRoute(async (req, res) => {
    if (!deleteUserGift(req.params.id, req.uid)) return res.status(404).json({ error: "Подарок не найден" });
    res.json({ ok: true });
  })
);

router.post(
  "/custom/send",
  asyncRoute(async (req, res) => {
    const gift = getUserGift(req.body?.giftId, req.uid);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    if (req.body?.recipientId === req.uid) return res.status(400).json({ error: "Нельзя подарить подарок самому себе" });
    const recipient = await getUser(req.body?.recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });
    const background = sanitizeGiftBackground(req.body?.background);
    const anonymous = await resolveAnonymous(req);
    const result = await deliverGift({ gift, recipientId: recipient.id, fromId: req.uid, announceFromId: req.uid, background, anonymous });
    if (!result.ok) return res.status(500).json({ error: "Не удалось отправить подарок" });
    res.json({ chatId: await senderChatId(result, req.uid, recipient.id), delivered: true });
  })
);

module.exports = router;
