const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const {
  getCurrentUserId,
  getSessionUserIds,
  addAccountSession,
  switchActiveAccount,
  removeAccountSession,
  getOrCreateDeviceId,
  requireUserId,
} = require("../middleware/auth");
const { findUserByEmail, findUserByPhone, findUserByReferralCode, createUser, getUser, grantPremiumDays } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { hashPassword, verifyPassword } = require("../security");
const { listSessions, upsertSession } = require("../data/sessions");
const { parseUserAgent } = require("../lib/userAgent");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { deleteAccount } = require("../lib/deleteAccount");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { KUGO_AI_ID } = require("../data/kugoAssistant");
const { PREMIUM_GRANT_DAYS } = require("../config");
const qrLogins = require("../data/qrLogins");
const codeLogins = require("../data/codeLogins");

const { EMAIL_RE, PHONE_RE, normalizePhone } = require("../lib/validators");

const router = express.Router();

// Tells the account (via the Shalter service chat — same one code logins use)
// that a new device just logged in, the way Telegram's own "Telegram" service
// chat does. Best-effort: login must still succeed even if this fails.
async function sendLoginAlert(userId, session) {
  try {
    const chat = await findOrCreateDm(userId, SYSTEM_BOT_ID);
    const when = new Date(session.lastActive).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await sendMessageAndBroadcast(
      chat,
      SYSTEM_BOT_ID,
      `🔐 Выполнен вход в аккаунт с нового устройства.\n\n${session.device} · ${session.location} · ${when}\n\nЕсли это были не вы — Настройки → Устройства → Завершить сессию.`
    );
  } catch (err) {
    console.error("login alert failed:", err);
  }
}

// Tells the referrer (also via a plain DM — not the service chat, since this
// is from the *person*, not the system) that their code was used.
// Seeds a welcome DM from the Kugo AI assistant so a new account discovers it
// immediately (rather than only via @kugo search). Best-effort — registration
// must still succeed if this fails. The greeting is a plain seeded message,
// not a model call, so it costs nothing and appears instantly.
async function seedKugoWelcome(userId) {
  try {
    const chat = await findOrCreateDm(userId, KUGO_AI_ID);
    await sendMessageAndBroadcast(
      chat,
      KUGO_AI_ID,
      "👋 Привет! Я Kugo AI — встроенный ИИ-ассистент Shalter. Спросите меня о чём угодно: помогу с идеями, объясню, переведу, подскажу. Просто напишите вопрос."
    );
  } catch (err) {
    console.error("Kugo welcome seed failed:", err);
  }
}

async function notifyReferralBonus(referrerId, newUser) {
  try {
    const chat = await findOrCreateDm(referrerId, newUser.id);
    await sendMessageAndBroadcast(
      chat,
      newUser.id,
      `🎉 Я зарегистрировался(ась) в Shalter по вашему коду приглашения! Нам обоим начислен Shalter Premium.`
    );
  } catch (err) {
    console.error("referral notification failed:", err);
  }
}

// Records/refreshes the Settings → Devices entry for this (account, browser)
// pair. Called on every event that establishes or resumes an authenticated
// session on this device — login, register, switch, QR/code confirmation.
// Fires the new-device alert above whenever this is a genuinely new device
// *and* the account already had at least one other session (so a brand new
// registration's very first device doesn't alert itself).
// The ban set from the reports moderation chat (routes/reports.js's
// /:id/resolve) or Settings → Модерация (routes/admin.js's /users/:id/ban) —
// the same flag middleware/auth.js's requireUserId checks on every request,
// re-checked at every point that hands out a session cookie so a banned
// account never gets one in the first place instead of logging in and then
// failing on the very next call. /code/verify and /qr/poll below used to skip
// this entirely, so an SMS-code or QR login *did* hand a banned account a
// session, dropping it into an app where every request 403'd with nothing on
// screen explaining why.
// Includes the recorded reason (server/data/users.js's setBanned), so the
// login screen can say what the ban was actually for.
function banError(user) {
  return user.banReason
    ? `Аккаунт заблокирован администрацией Shalter. Причина: ${user.banReason}`
    : "Аккаунт заблокирован администрацией Shalter";
}

async function recordSession(req, res, userId) {
  const deviceId = getOrCreateDeviceId(req, res);
  const priorSessions = await listSessions(userId);
  const { session, isNewDevice } = await upsertSession({
    userId,
    deviceId,
    device: parseUserAgent(req.headers["user-agent"]),
    location: req.ip || "неизвестно",
  });
  if (isNewDevice && priorSessions.length > 0) await sendLoginAlert(userId, session);
  return session;
}

router.post(
  "/login-email",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = await findUserByEmail(email ?? "");

    // Same generic error whether the email or the password was wrong —
    // don't tell an attacker which part of the guess was right.
    if (
      !user ||
      !user.passwordHash ||
      !user.passwordSalt ||
      !verifyPassword(password ?? "", user.passwordHash, user.passwordSalt)
    ) {
      return res.status(401).json({ error: "Неверный email или пароль" });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: banError(user) });
    }

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  })
);

router.post(
  "/register-email",
  asyncRoute(async (req, res) => {
    const { name, email, password, phone, referralCode } = req.body ?? {};

    if (!name?.trim()) return res.status(400).json({ error: "Введите имя" });
    if (!EMAIL_RE.test(email ?? "")) return res.status(400).json({ error: "Некорректный email" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
    }
    const normalizedPhone = normalizePhone(phone);
    if (!PHONE_RE.test(normalizedPhone)) {
      return res.status(400).json({ error: "Введите номер телефона в формате +79991234567" });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: "Аккаунт с таким email уже существует" });
    }
    if (await findUserByPhone(normalizedPhone)) {
      return res.status(409).json({ error: "Аккаунт с таким номером телефона уже существует" });
    }

    let referrer = null;
    if (referralCode?.trim()) {
      referrer = await findUserByReferralCode(referralCode);
      if (!referrer) return res.status(400).json({ error: "Код друга не найден — проверьте и попробуйте снова" });
    }

    const { hash, salt } = hashPassword(password);
    const user = await createUser({
      id: `u_${Date.now()}`,
      name: name.trim(),
      phone: normalizedPhone,
      email: email.trim().toLowerCase(),
      passwordHash: hash,
      passwordSalt: salt,
      avatarColor: "#2E56D9",
      bio: "",
      online: true,
      lastSeen: new Date().toISOString(),
      referredBy: referrer?.id,
      // The referral bonus: both the new account and the friend who invited
      // them get Premium, one-time, the moment registration completes.
      premiumUntil: referrer ? new Date(Date.now() + PREMIUM_GRANT_DAYS * 86400000).toISOString() : undefined,
    });

    if (referrer) {
      await grantPremiumDays(referrer.id, PREMIUM_GRANT_DAYS);
      await notifyReferralBonus(referrer.id, user);
    }
    await seedKugoWelcome(user.id);

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  })
);

router.get(
  "/session",
  asyncRoute(async (req, res) => {
    const uid = getCurrentUserId(req);
    const ids = getSessionUserIds(req);
    const accountUsers = (await Promise.all(ids.map((id) => getUser(id)))).filter((u) => u !== undefined);

    if (!uid) return res.json({ user: null, accounts: [] });
    const user = await getUser(uid);
    res.json({
      user: user ? publicUser(user) : null,
      accounts: accountUsers.map(publicUser),
    });
  })
);

router.post(
  "/switch",
  asyncRoute(async (req, res) => {
    const { userId } = req.body ?? {};
    const ids = getSessionUserIds(req);
    if (!ids.includes(userId)) {
      return res.status(403).json({ error: "Этот аккаунт не подключён на этом устройстве" });
    }
    switchActiveAccount(req, res, userId);
    await recordSession(req, res, userId);
    const user = await getUser(userId);
    res.json({ user: user ? publicUser(user) : null });
  })
);

// Body is optional: {} logs out the active account only, leaving any other
// accounts open on this browser signed in (mirrors Telegram's per-account logout).
router.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    const uid = body.uid ?? getCurrentUserId(req);
    if (!uid) return res.json({ ok: true, remaining: [] });
    const remaining = removeAccountSession(req, res, uid);
    res.json({ ok: true, remaining });
  })
);

// Real, permanent deletion (see server/lib/deleteAccount.js for the full
// cascade) — requires re-entering the password even though the session is
// already authenticated, same "prove it's really you" bar as changing a
// password would have, given how irreversible this is.
router.post(
  "/delete-account",
  requireUserId,
  asyncRoute(async (req, res) => {
    const user = await getUser(req.uid);
    if (
      !user?.passwordHash ||
      !user?.passwordSalt ||
      !verifyPassword(req.body?.password ?? "", user.passwordHash, user.passwordSalt)
    ) {
      return res.status(401).json({ error: "Неверный пароль" });
    }
    await deleteAccount(req.uid);
    removeAccountSession(req, res, req.uid);
    res.json({ ok: true });
  })
);

// QR login: a real, scannable QR code (see public/js/views/login.js) encodes
// an absolute URL to /qr-login?token=... on *this* server. Any phone camera
// can scan it — no in-app scanner needed. Whoever opens that link (already
// logged in, or after logging in right there) taps "Confirm" to authenticate
// the original, still-waiting browser. Token state lives in server/data/
// qrLogins.js — ephemeral and in-memory, same pattern as typing presence.
router.post(
  "/qr/start",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    const token = qrLogins.createToken(deviceId);
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({ token, loginUrl: `${origin}/qr-login?token=${token}` });
  })
);

// Polled by the waiting (unauthenticated) browser. Finalizes the session
// itself once confirmed, since this request carries *that* browser's cookies
// — same addAccountSession/recordSession as a normal login.
router.get(
  "/qr/poll",
  asyncRoute(async (req, res) => {
    const { token } = req.query;
    const entry = qrLogins.getEntry(String(token ?? ""));
    if (!entry) return res.json({ status: "expired" });
    if (!entry.confirmedUserId) return res.json({ status: "pending" });

    const consumed = qrLogins.consume(String(token));
    if (!consumed) return res.json({ status: "pending" }); // lost a race, try again
    const user = await getUser(consumed.confirmedUserId);
    if (!user) return res.json({ status: "expired" });
    if (user.isBanned) return res.json({ status: "banned", error: banError(user) });

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ status: "confirmed", user: publicUser(user) });
  })
);

// Called by the already-authenticated device that scanned the code (or just
// logged in on the /qr-login page) — requires a real session, since this is
// the side vouching for the login.
router.post(
  "/qr/confirm",
  requireUserId,
  asyncRoute(async (req, res) => {
    const { token } = req.body ?? {};
    const result = qrLogins.confirm(String(token ?? ""), req.uid);
    if (result === "expired") return res.status(410).json({ error: "QR-код устарел, обновите его на другом устройстве" });
    if (result === "already-used") return res.status(409).json({ error: "Этот код уже использован" });
    res.json({ ok: true });
  })
);

// Login by numeric code: the *same* underlying idea as QR, just typed
// instead of scanned. Only works if the account already has another
// logged-in device — the code is delivered as a message from the Shalter
// service account (server/data/systemBot.js), which only an existing
// session can actually see. There's no SMS gateway here, so unlike
// Telegram/WhatsApp this can't fall back to a text message.
router.post(
  "/code/start",
  asyncRoute(async (req, res) => {
    const user = await findUserByPhone(normalizePhone(req.body?.phone));
    if (!user) return res.status(404).json({ error: "Аккаунт с таким номером не найден" });

    const code = codeLogins.createCode(user.id);
    const chat = await findOrCreateDm(user.id, SYSTEM_BOT_ID);
    await sendMessageAndBroadcast(
      chat,
      SYSTEM_BOT_ID,
      `🔢 Код для входа в Shalter: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.`
    );
    res.json({ ok: true });
  })
);

router.post(
  "/code/verify",
  asyncRoute(async (req, res) => {
    const user = await findUserByPhone(normalizePhone(req.body?.phone));
    const code = String(req.body?.code ?? "").trim();
    if (!user || !codeLogins.verify(user.id, code)) {
      return res.status(401).json({ error: "Неверный или устаревший код" });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: banError(user) });
    }
    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  })
);

module.exports = router;
