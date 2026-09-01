const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getUser, updateUser, findUserByPhone } = require("../data/users");
const { normalizePhone } = require("../lib/validators");
const { publicUser } = require("../data/sanitize");
const { balanceOf, spendStars, addStars } = require("../data/stars");
const { checkUsername, normalizeUsername } = require("../lib/username");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const auctions = require("../data/usernameAuctions");
const listings = require("../data/usernameListings");

// The username auction.
//
// Short handles became possible when the minimum dropped to three characters
// (lib/validators.js), and they are scarce by definition — first come, first
// served forever is the only other way to distribute them. So: the
// administration puts a *free* handle up, people bid stars, and when it closes
// the winner is charged and gets it.
//
// Stars are taken at settlement, not at bid time. Holding them for the duration
// would mean freezing someone's balance on an auction they might not win, and
// this app has no escrow. The trade-off is stated where it's enforced below: a
// winner whose balance has since dropped loses the auction, and the next bidder
// who can still pay takes it.

const router = express.Router();
router.use(requireUserId);

const MIN_STEP_STARS = 10;
// Нижняя цена объявления. Не ноль: бесплатное объявление — это способ раздать
// хендл мимо аукциона, а заодно и мусор в списке.
const MIN_LISTING_STARS = 10;

async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!isAdminPhone(me?.phone)) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

async function tell(userId, text) {
  try {
    const chat = await findOrCreateDm(SYSTEM_BOT_ID, userId);
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
  } catch (err) {
    console.error("username auction notice failed:", err);
  }
}

// Closing an auction: charge the highest bidder who can still pay, hand over the
// handle, tell everyone involved. Called both by the admin's "close now" and by
// the lazy sweep on every read — there is no scheduler here, and an auction
// whose deadline passed while nobody was looking must still settle.
async function settle(auction) {
  if (auction.status !== "open") return auction;

  // Highest first, and only one attempt per person: their latest bid is the
  // only one that could still be honoured.
  const seen = new Set();
  const ranked = [...auction.bids]
    .sort((a, b) => b.stars - a.stars)
    .filter((b) => (seen.has(b.userId) ? false : seen.add(b.userId)));

  for (const bid of ranked) {
    const bidder = await getUser(bid.userId);
    if (!bidder) continue;
    // The handle may have been taken by an ordinary registration while the
    // auction ran — the auction never reserved it.
    const problem = await checkUsername(auction.username, { forUserId: bidder.id });
    if (problem) {
      await tell(bid.userId, `Аукцион @${auction.username} отменён: юзернейм больше недоступен. Звёзды не списаны.`);
      return auctions.settleAuction(auction.id, { status: "cancelled" });
    }
    if (balanceOf(bidder.id) < bid.stars || !spendStars(bidder.id, bid.stars)) {
      await tell(bid.userId, `Вы выиграли @${auction.username} за ${bid.stars} ⭐, но на балансе не хватило звёзд — юзернейм ушёл следующему участнику.`);
      continue;
    }
    // The handle and its provenance are written together: that's what makes it
    // collectible rather than just a short name.
    await updateUser(bidder.id, { username: auction.username, usernameAuctionId: auction.id });
    await tell(bid.userId, `🏆 Вы выиграли аукцион: теперь ваш юзернейм @${auction.username}. Списано ${bid.stars} ⭐.`);
    return auctions.settleAuction(auction.id, { status: "sold", winnerId: bidder.id, soldForStars: bid.stars });
  }

  return auctions.settleAuction(auction.id, { status: ranked.length ? "cancelled" : "unsold" });
}

// Settles anything whose time is up, then lists. Doing it on read keeps the app
// scheduler-free (see AGENTS.md: one process, no job runner).
async function sweep() {
  for (const a of auctions.listAuctions()) {
    if (a.expired) await settle(a);
  }
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    await sweep();
    const me = await getUser(req.uid);
    const list = auctions.listAuctions();
    const withNames = await Promise.all(
      list.map(async (a) => ({
        ...a,
        // Who is currently winning, by name — the bid list itself stays server-side
        // detail; what a bidder needs to know is whether they are being outbid.
        topBidder: a.topBidderId ? publicUser(await getUser(a.topBidderId)) : null,
        myBid: a.bids.filter((b) => b.userId === req.uid).pop()?.stars ?? null,
      }))
    );
    res.json({
      auctions: withNames,
      balance: balanceOf(req.uid),
      minStep: MIN_STEP_STARS,
      isAdmin: isAdminPhone(me?.phone),
    });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

    const username = normalizeUsername(req.body?.username);
    // Only a handle nobody holds: auctioning one that's taken would be selling
    // something that isn't yours to sell.
    const problem = await checkUsername(username);
    if (problem) return res.status(problem.status).json({ error: problem.error });
    if (auctions.findOpenByUsername(username)) return res.status(409).json({ error: "Этот юзернейм уже на аукционе" });

    const startPriceStars = Math.max(0, Math.trunc(Number(req.body?.startPriceStars) || 0));
    const hours = Math.max(1, Math.min(24 * 30, Math.trunc(Number(req.body?.hours) || 24)));
    const auction = auctions.createAuction({
      username,
      startPriceStars,
      endsAt: new Date(Date.now() + hours * 3600_000).toISOString(),
    });
    res.json({ auction });
  })
);

router.post(
  "/:id/bid",
  asyncRoute(async (req, res) => {
    await sweep();
    const auction = auctions.getAuction(req.params.id);
    if (!auction) return res.status(404).json({ error: "Аукцион не найден" });
    if (auction.status !== "open") return res.status(409).json({ error: "Аукцион уже завершён" });

    const stars = Math.trunc(Number(req.body?.stars));
    const floor = auction.topBid == null ? auction.startPriceStars : auction.topBid + MIN_STEP_STARS;
    if (!Number.isFinite(stars) || stars < floor) {
      return res.status(400).json({ error: `Минимальная ставка — ${floor} ⭐` });
    }
    // Checked now and again at settlement: bidding stars you don't have would
    // let one account stall an auction for free.
    if (balanceOf(req.uid) < stars) {
      return res.status(402).json({ error: `Не хватает звёзд — на балансе ${balanceOf(req.uid)} ⭐`, balance: balanceOf(req.uid) });
    }
    if (auction.topBidderId === req.uid) return res.status(409).json({ error: "Вы и так лидируете" });

    const outbid = auction.topBidderId;
    const updated = auctions.addBid(auction.id, req.uid, stars);
    if (outbid && outbid !== req.uid) {
      await tell(outbid, `Вашу ставку на @${auction.username} перебили — теперь ${stars} ⭐. Ставки принимаются до ${new Date(auction.endsAt).toLocaleString("ru-RU")}.`);
    }
    res.json({ auction: updated, balance: balanceOf(req.uid) });
  })
);

// Ending one early — the admin's call, and the only way to finish an auction
// nobody is bidding on before its deadline.
router.post(
  "/:id/close",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const auction = auctions.getAuction(req.params.id);
    if (!auction) return res.status(404).json({ error: "Аукцион не найден" });
    res.json({ auction: await settle(auction) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const auction = auctions.getAuction(req.params.id);
    if (!auction) return res.status(404).json({ error: "Аукцион не найден" });
    // Nothing was charged while it ran, so cancelling costs nobody anything —
    // but the bidders were told they were winning, so they're told it's off.
    for (const userId of new Set(auction.bids.map((b) => b.userId))) {
      await tell(userId, `Аукцион @${auction.username} отменён администрацией. Звёзды не списывались.`);
    }
    auctions.deleteAuction(auction.id);
    res.json({ ok: true });
  })
);

// Handing a username over directly, without an auction — "владелец даёт
// юзернеймы". The other half of the same job: some handles are given, not sold.
router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    // By phone number, not by internal id: an id is something the admin would
    // have to dig out of a database, while the number is what the person tells
    // them. The id is still accepted so anything already calling this keeps
    // working.
    const target = req.body?.phone
      ? await findUserByPhone(normalizePhone(req.body.phone))
      : await getUser(req.body?.userId);
    if (!target) return res.status(404).json({ error: "Пользователь с таким номером не найден" });

    const username = normalizeUsername(req.body?.username);
    const problem = await checkUsername(username, { forUserId: target.id });
    if (problem) return res.status(problem.status).json({ error: problem.error });

    const updated = await updateUser(target.id, { username });
    await tell(target.id, `Администрация Shalter выдала вам юзернейм @${username}.`);
    res.json({ user: publicUser(updated) });
  })
);

// ── Рынок: перепродажа юзернеймов между людьми ──────────────────────────────
//
// Аукцион выше раздаёт свободные хендлы от имени администрации. Здесь другое:
// человек продаёт то, чем уже владеет, по своей цене — и хендл, который иначе
// просто лежал бы занятым на заброшенном аккаунте, возвращается в оборот.
//
// Владение живёт в users.username и больше нигде: объявление — это намерение
// продать, а не запись о владении. Поэтому актуальность проверяется при каждом
// чтении и ещё раз в момент покупки: между «выставил» и «купили» продавец мог
// сменить юзернейм, и объявление обязано это заметить, а не продать воздух.
async function marketView(uid) {
  const open = listings.listOpen();
  const alive = [];
  for (const l of open) {
    const seller = await getUser(l.sellerId);
    // Продавец больше не держит этот хендл — объявление снимается само.
    if (!seller || (seller.username ?? "").toLowerCase() !== l.username.toLowerCase()) {
      listings.closeListing(l.id, { status: "withdrawn" });
      continue;
    }
    alive.push({ ...l, seller: publicUser(seller), mine: l.sellerId === uid });
  }
  return alive;
}

router.get(
  "/market",
  asyncRoute(async (req, res) => {
    res.json({ listings: await marketView(req.uid), balance: balanceOf(req.uid) });
  })
);

router.post(
  "/market",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const username = normalizeUsername(me?.username);
    if (!username) return res.status(400).json({ error: "Сначала займите юзернейм — продавать нечего" });

    const priceStars = Math.round(Number(req.body?.priceStars));
    if (!Number.isFinite(priceStars) || priceStars < MIN_LISTING_STARS) {
      return res.status(400).json({ error: `Цена — от ${MIN_LISTING_STARS} ⭐` });
    }
    if (listings.findOpenByUsername(username)) return res.status(409).json({ error: "Этот юзернейм уже выставлен" });
    // Хендл, который прямо сейчас разыгрывается администрацией, продавать
    // нельзя: иначе один и тот же @ уйдёт двум разным людям.
    if (auctions.findOpenByUsername(username)) return res.status(409).json({ error: "Этот юзернейм сейчас на аукционе" });

    const listing = listings.createListing({ username, sellerId: req.uid, priceStars });
    res.json({ listing });
  })
);

router.delete(
  "/market/:id",
  asyncRoute(async (req, res) => {
    const listing = listings.getListing(req.params.id);
    if (!listing || listing.status !== "open") return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.sellerId !== req.uid) return res.status(403).json({ error: "Снять объявление может только продавец" });
    res.json({ listing: listings.closeListing(listing.id, { status: "withdrawn" }) });
  })
);

router.post(
  "/market/:id/buy",
  asyncRoute(async (req, res) => {
    const listing = listings.getListing(req.params.id);
    if (!listing || listing.status !== "open") return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.sellerId === req.uid) return res.status(400).json({ error: "Это ваше объявление" });

    const seller = await getUser(listing.sellerId);
    if (!seller || (seller.username ?? "").toLowerCase() !== listing.username.toLowerCase()) {
      listings.closeListing(listing.id, { status: "withdrawn" });
      return res.status(410).json({ error: "Продавец больше не владеет этим юзернеймом" });
    }
    if (balanceOf(req.uid) < listing.priceStars) {
      return res.status(402).json({ error: `Не хватает звёзд: нужно ${listing.priceStars} ⭐` });
    }

    // Порядок важен: сначала снять хендл с продавца, потом отдать покупателю.
    // Наоборот нельзя — уникальный индекс по lower(username) не даст двум
    // строкам держать один и тот же, и покупка упала бы на середине.
    //
    // Пустая строка, а не null: столбец объявлен NOT NULL DEFAULT '' (db.js), и
    // «нет юзернейма» во всей базе выражается именно так.
    await updateUser(seller.id, { username: "" });
    await updateUser(req.uid, { username: listing.username });
    spendStars(req.uid, listing.priceStars);
    addStars(seller.id, listing.priceStars);
    listings.closeListing(listing.id, { status: "sold", buyerId: req.uid });

    const buyer = await getUser(req.uid);
    for (const [userId, text] of [
      [seller.id, `💰 Ваш юзернейм @${listing.username} продан за ${listing.priceStars} ⭐.\n\nЗвёзды уже на балансе. Новый юзернейм можно занять в настройках профиля.`],
      [req.uid, `🎉 Юзернейм @${listing.username} теперь ваш — списано ${listing.priceStars} ⭐.`],
    ]) {
      try {
        const chat = await findOrCreateDm(userId, SYSTEM_BOT_ID);
        await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
      } catch (err) {
        console.error("username sale notice failed:", err);
      }
    }

    res.json({ ok: true, username: listing.username, user: publicUser(buyer), balance: balanceOf(req.uid) });
  })
);

module.exports = router;
