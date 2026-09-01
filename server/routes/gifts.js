const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getUser, findUserByPhone, removeReceivedGift } = require("../data/users");
const { balanceOf, spendStars, addStars } = require("../data/stars");
const { listGifts, getGift, setSupply, createGift, deleteCustomGift, conversionValue, SUPPLY_MIN, SUPPLY_MAX } = require("../data/gifts");
const { remaining, issuedCount } = require("../data/giftIssues");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { deliverGift } = require("../lib/deliverGift");
const { isConnected: isDonationAlertsConnected, getDonationPageUrl } = require("../lib/donationAlerts");
const { createPendingOrder } = require("../data/pendingOrders");

const router = express.Router();
router.use(requireUserId);

// "все 1 экземпляров" reads as broken Russian, and the supplies in the
// catalog (1, 3, 5, 10, 25, 50) hit every branch of the rule — so this is
// a real declension, not decoration.
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

// `remaining` is computed per request rather than stored on the catalog —
// it changes every time a limited gift is delivered, and the catalog itself
// is a static module-level array shared by every caller.
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const gifts = listGifts().map((g) => (g.supply ? { ...g, remaining: remaining(g) } : g));
    // The balance rides along with the catalogue so the picker can show it in its
    // header without a second round trip — that header is where someone decides
    // whether they can afford anything.
    res.json({ gifts, balance: balanceOf(req.uid) });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    const recipientId = req.body?.recipientId || req.uid;
    const recipient = await getUser(recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });

    // Checked up front so a sold-out limited gift fails here, before anyone
    // is told to transfer money for it. It's re-checked at delivery time
    // too (that's the check that actually protects the supply) — the last
    // copy can still sell between paying and the payment clearing, which
    // lib/donationAlerts.js handles by telling the buyer rather than
    // silently pocketing it.
    if (gift.supply && remaining(gift) <= 0) {
      return res.status(410).json({ error: soldOutError(gift) });
    }

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });

    // The admin has nobody to send a payment request *to* — they'd just be
    // asking themselves for confirmation — so their gifts deliver instantly
    // and for free instead of round-tripping through the same "перевожу и
    // жду подтверждения" message everyone else sends.
    if (admin.id === req.uid) {
      const result = await deliverGift({ gift, recipientId: recipient.id, fromId: req.uid, announceFromId: req.uid });
      if (!result.ok) return res.status(410).json({ error: soldOutError(gift) });
      return res.json({ chatId: result.chat.id, adminPhone: ADMIN_PHONE, delivered: true, serial: result.serial });
    }

    const forSelf = recipientId === req.uid;

    // Same as premium.js's /request — DonationAlerts if connected, otherwise a
    // plain transfer that the admin fulfils from the buyer's profile.
    if (isDonationAlertsConnected()) {
      const donationUrl = getDonationPageUrl();
      if (donationUrl) {
        const order = await createPendingOrder({ userId: req.uid, kind: "gift", giftId: gift.id, recipientId, amountRub: gift.priceRub });
        return res.json({ code: order.code, donationUrl, amountRub: gift.priceRub });
      }
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `🎁 Хочу подарить ${gift.emoji} «${gift.name}» за ${gift.priceRub}₽ ${forSelf ? "себе" : `пользователю ${recipient.name}`}. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

// Actually delivers a gift — restricted to whoever currently holds
// ADMIN_PHONE, same as Premium's /grant. Posts the announcement in the
// admin's DM with the recipient (that's the chat the recipient will
// actually see it in) and applies the Premium duration if the gift grants one.
router.post(
  "/deliver",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me.phone)) return res.status(403).json({ error: "Недостаточно прав" });

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

// Buying a gift with stars: instant, self-serve, no admin in the loop. This is
// the primary way to send a gift — the ruble/transfer path below stays for
// someone who would rather pay money directly for an expensive one.
router.post(
  "/buy",
  asyncRoute(async (req, res) => {
    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    const recipientId = req.body?.recipientId || req.uid;
    const recipient = await getUser(recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });
    if (gift.supply && remaining(gift) <= 0) return res.status(410).json({ error: soldOutError(gift) });

    const price = gift.priceStars;
    if (!spendStars(req.uid, price)) {
      return res.status(402).json({
        error: `Не хватает звёзд — нужно ${price.toLocaleString("ru-RU")} ⭐`,
        needStars: price,
        balance: balanceOf(req.uid),
      });
    }

    const result = await deliverGift({ gift, recipientId, fromId: req.uid, announceFromId: req.uid });
    if (!result.ok) {
      // The last copy went between the supply check and the claim — hand the
      // stars back rather than keeping them for a gift that was never delivered.
      addStars(req.uid, price);
      return res.status(410).json({ error: soldOutError(gift), balance: balanceOf(req.uid) });
    }
    res.json({ chatId: result.chat.id, serial: result.serial, delivered: true, balance: balanceOf(req.uid) });
  })
);

// Converting a received gift back into stars — Telegram's "обменять на звёзды".
// The shelf entry goes and the stars land on the balance.
router.post(
  "/received/:entryId/convert",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const entry = (me?.giftsReceived ?? []).find((g) => (g.id ? g.id === req.params.entryId : `${g.emoji}|${g.at}` === req.params.entryId));
    if (!entry) return res.status(404).json({ error: "Подарок не найден на вашей полке" });

    // Priced from the catalogue when the gift is still there, and from what was
    // stored on the shelf entry otherwise — a gift the admin has since removed
    // from the catalogue must still be convertible.
    const catalogGift = getGift(entry.giftId ?? "");
    const value = conversionValue(catalogGift ?? { priceRub: entry.priceRub ?? 1, priceStars: entry.priceStars });
    if (!removeReceivedGift(req.uid, req.params.entryId)) {
      return res.status(404).json({ error: "Подарок не найден на вашей полке" });
    }
    const balance = addStars(req.uid, value);
    res.json({ balance, gained: value, user: publicUser(await getUser(req.uid)) });
  })
);

// Removing a gift from your own shelf. Only your own: a shelf is part of a
// profile, and letting anyone clear someone else's would make the whole display
// meaningless.
//
// The serial of a limited gift is *not* released — see data/users.js's
// removeReceivedGift for why.
router.delete(
  "/received/:entryId",
  asyncRoute(async (req, res) => {
    if (!removeReceivedGift(req.uid, req.params.entryId)) {
      return res.status(404).json({ error: "Подарок не найден на вашей полке" });
    }
    res.json({ user: publicUser(await getUser(req.uid)) });
  })
);

// ── Catalogue management (admin only) ───────────────────────────────────────
// The shipped catalogue is code (server/data/gifts.js); these routes let
// whoever holds ADMIN_PHONE change a limited run's size and mint new gifts,
// without a redeploy.

async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!isAdminPhone(me?.phone)) {
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

// The admin view: every gift with how many copies are already out, so a supply
// can't be changed blind.
router.get(
  "/catalog",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const gifts = listGifts().map((g) => (g.supply ? { ...g, issued: issuedCount(g.id), remaining: remaining(g) } : g));
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

    // Lowering below what's already been handed out would leave real copies
    // numbered above their own edition ("#4200 из 3000") and, worse, would let
    // the same serial be minted twice later. The floor is what exists.
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
  "/catalog",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { emoji, name, priceStars, premiumDays, supply, exclusive } = req.body ?? {};

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

    // Slug from the name so the id is readable in the DB and in exports, with a
    // timestamp suffix guaranteeing uniqueness against the 286 built-ins and
    // against anything minted earlier.
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
      // null means "Premium forever" (see data/users.js's grantPremiumDays);
      // anything else is a day count, 0 for a purely decorative gift.
      premiumDays: premiumDays === null ? null : Number.isInteger(Number(premiumDays)) ? Number(premiumDays) : 0,
      supply: supplyValue,
      exclusive: !!exclusive,
    });
    res.json({ gift });
  })
);

router.delete(
  "/catalog/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    // A gift with copies in the wild keeps its catalogue entry — that entry is
    // what gives the copies on people's profiles a name and an emoji.
    if (issuedCount(req.params.id) > 0) {
      return res.status(409).json({ error: "Подарок уже выпускался — его нельзя удалить, можно только изменить тираж" });
    }
    if (!deleteCustomGift(req.params.id)) {
      return res.status(400).json({ error: "Удалять можно только подарки, созданные администратором" });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
