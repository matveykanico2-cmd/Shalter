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
const { findUserByEmail, findUserByPhone, findUserByReferralCode, createUser, getUser, updateUser, grantPremiumDays, startTotpSetup, startChatTwoFactor, enableTotp, disableTotp, consumeRecoveryCode } = require("../data/users");
const { publicUser, selfUser } = require("../data/sanitize");
const { hashPassword, verifyPassword } = require("../security");
const { listSessions, getSession, upsertSession, revokeAllSessions, revokeOtherSessions } = require("../data/sessions");
const { parseUserAgent } = require("../lib/userAgent");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { deleteAccount } = require("../lib/deleteAccount");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { PREMIUM_GRANT_DAYS } = require("../config");
const qrLogins = require("../data/qrLogins");
const codeLogins = require("../data/codeLogins");

const { EMAIL_RE, PHONE_RE, normalizePhone } = require("../lib/validators");
const { checkUsername, normalizeUsername, isUsernameConflict } = require("../lib/username");
const totp = require("../lib/totp");
const twoFactorTickets = require("../data/twoFactorTickets");
const emailChanges = require("../data/emailChanges");
const { sendMail } = require("../lib/mailer");

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

// Called at the end of every path that has just verified a first factor
// (password, or a login code delivered to an already-signed-in device). If the
// account has 2FA on, it must NOT get a session yet — that would make the second
// factor cosmetic, since the cookie is what actually grants access. Instead it
// gets a short-lived ticket (data/twoFactorTickets.js) to trade for a session at
// /2fa/login.
async function finishLogin(req, res, user) {
  if (user.twoFactorEnabled) {
    const { ticket, expiresInSec } = twoFactorTickets.create(user.id);
    const method = user.twoFactorMethod ?? "totp";
    // The code is sent as part of issuing the ticket, so the login screen has
    // something to ask for the moment it appears rather than making people hunt
    // for a "send me a code" button.
    if (method === "chat") await sendTwoFactorCode(user.id).catch((err) => console.error("2fa code send failed:", err));
    return res.json({
      twoFactorRequired: true,
      ticket,
      expiresInSec,
      name: user.name,
      method,
      // Подсказка к облачному паролю. Её видит тот, кто уже прошёл первый шаг,
      // то есть знает пароль от аккаунта, — на этом месте она и нужна. Для
      // остальных способов её нет и быть не может.
      hint: method === "password" ? user.cloudPasswordHint || null : null,
    });
  }
  addAccountSession(req, res, user.id);
  await recordSession(req, res, user.id);
  return res.json({ user: selfUser(user) });
}

// The ban set from the reports moderation chat (routes/reports.js's
// /:id/resolve) or Settings → Модерация (routes/admin.js's /users/:id/ban) —
// the same flag middleware/auth.js's requireUserId checks on every request,
// re-checked at every point that hands out a session cookie so a banned
// account never gets one in the first place instead of logging in and then
// failing on the very next call. /code/verify and /qr/poll used to skip this
// entirely, so an SMS-code or QR login *did* hand a banned account a session,
// dropping it into an app where every request 403'd with nothing on screen
// explaining why.
// Includes the recorded reason (server/data/users.js's setBanned), so the login
// screen can say what the ban was actually for.
function banError(user) {
  return user.banReason
    ? `Аккаунт заблокирован администрацией Shalter. Причина: ${user.banReason}`
    : "Аккаунт заблокирован администрацией Shalter";
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

    return finishLogin(req, res, user);
  })
);

router.post(
  "/register-email",
  asyncRoute(async (req, res) => {
    const { name, email, password, phone, username, referralCode } = req.body ?? {};

    if (!name?.trim()) return res.status(400).json({ error: "Введите имя" });
    if (!EMAIL_RE.test(email ?? "")) return res.status(400).json({ error: "Некорректный email" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
    }
    // Asked for at registration rather than left to a later trip through
    // Settings → Профиль: the only way to add someone here is by their exact
    // @handle (see public/js/views/contacts.js), so an account created without
    // one is unreachable — nobody can look it up at all until its owner happens
    // to go and set one.
    const handle = normalizeUsername(username);
    const usernameProblem = await checkUsername(handle);
    if (usernameProblem) return res.status(usernameProblem.status).json({ error: usernameProblem.error });
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
    let user;
    try {
      user = await createUser({
        id: `u_${Date.now()}`,
        name: name.trim(),
        username: handle,
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
    } catch (err) {
      // Two people registering the same handle at the same moment: both pass
      // the check above, then the unique index on lower(username) rejects the
      // second insert. That's a "занят", not a 500.
      if (isUsernameConflict(err)) return res.status(409).json({ error: "Этот юзернейм уже занят" });
      throw err;
    }

    if (referrer) {
      await grantPremiumDays(referrer.id, PREMIUM_GRANT_DAYS);
      await notifyReferralBonus(referrer.id, user);
    }

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: selfUser(user) });
  })
);

// Live "свободен / занят" feedback for the registration form. Unauthenticated
// by necessity (it's used before an account exists) and harmless: handles are
// public by design — you look people up by typing an exact one.
router.get(
  "/username-available",
  asyncRoute(async (req, res) => {
    const handle = normalizeUsername(req.query.u);
    const problem = await checkUsername(handle);
    res.json({ username: handle, available: !problem, error: problem?.error ?? null });
  })
);

router.get(
  "/session",
  asyncRoute(async (req, res) => {
    const uid = getCurrentUserId(req);
    const ids = getSessionUserIds(req);

    // Revocation has to be honoured here too, not only in requireUserId. This
    // is the endpoint the app asks "who am I" on every boot, and it answers
    // from cookies alone — so a device whose session was terminated (Settings →
    // Устройства, or a password change signing out everything else) kept
    // getting its own name, phone and address back from here indefinitely,
    // and kept rendering the app until some *other* request happened to 401.
    // Revocation is per account per device, so each account is checked on its own.
    const deviceId = getOrCreateDeviceId(req, res);
    const revoked = new Set(
      (await Promise.all(ids.map(async (id) => ((await getSession(id, deviceId))?.revokedAt ? id : null)))).filter(Boolean)
    );
    const accountUsers = (await Promise.all(ids.filter((id) => !revoked.has(id)).map((id) => getUser(id)))).filter((u) => u !== undefined);

    if (!uid || revoked.has(uid)) return res.json({ user: null, accounts: accountUsers.map(selfUser) });
    const user = await getUser(uid);
    res.json({
      user: user ? selfUser(user) : null,
      // Every account signed in on this device — all of them are "yours" here,
      // which is why the switcher may show their addresses.
      accounts: accountUsers.map(selfUser),
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
    res.json({ user: user ? selfUser(user) : null });
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
// Проверить пароль, ничего не меняя. Нужен замку при запуске (см. настройку
// requirePasswordOnLaunch): приложение уже вошло в аккаунт, но не пускает
// дальше, пока не введён пароль — от того, кто взял разблокированный телефон.
router.post(
  "/verify-password",
  requireUserId,
  asyncRoute(async (req, res) => {
    const user = await getUser(req.uid);
    const ok =
      !!user?.passwordHash && !!user?.passwordSalt && verifyPassword(String(req.body?.password ?? ""), user.passwordHash, user.passwordSalt);
    if (!ok) return res.status(401).json({ error: "Неверный пароль" });
    res.json({ ok: true });
  })
);

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

// Changing the password from inside the app — the ordinary case, where you know
// the current one and simply want a different one. (Forgetting it is what
// /recover/* above is for.)
//
// Every other session is signed out. If the reason for changing a password is
// that someone else might know it, leaving their session alive would defeat the
// change entirely; and if the reason is routine, signing back in is cheap.
router.post(
  "/change-password",
  requireUserId,
  asyncRoute(async (req, res) => {
    const user = await getUser(req.uid);
    const current = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");

    if (!user?.passwordHash || !user?.passwordSalt || !verifyPassword(current, user.passwordHash, user.passwordSalt)) {
      return res.status(401).json({ error: "Неверный текущий пароль" });
    }
    if (next.length < 6) return res.status(400).json({ error: "Новый пароль — не короче 6 символов" });
    if (next === current) return res.status(400).json({ error: "Новый пароль совпадает со старым" });

    const { hash, salt } = hashPassword(next);
    await updateUser(req.uid, { passwordHash: hash, passwordSalt: salt });
    await revokeOtherSessions(req.uid, getOrCreateDeviceId(req, res));

    try {
      const chat = await findOrCreateDm(req.uid, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        "🔐 Пароль изменён. Все остальные сеансы завершены.\n\nЕсли это были не вы — восстановите доступ и включите двухфакторную аутентификацию: Настройки → Конфиденциальность."
      );
    } catch (err) {
      console.error("password change notice failed:", err);
    }
    res.json({ ok: true });
  })
);

// Смена адреса почты: пароль и новый адрес, без кода подтверждения.
//
// Так попросил владелец приложения, и это его решение — но у него есть цена,
// поэтому она записана здесь, а не забыта: код на новый адрес подтверждал, что
// адрес существует и принадлежит вам. Без него опечатка в адресе означает, что
// письмо для восстановления пароля уйдёт в чужой или несуществующий ящик, и
// узнается это в тот единственный день, когда доступ действительно нужен.
// Поэтому адрес проверяется хотя бы по форме и на занятость, а владельцу
// уходит уведомление в служебный чат.
router.post(
  "/email/start",
  requireUserId,
  asyncRoute(async (req, res) => {
    const user = await getUser(req.uid);
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!user?.passwordHash || !user?.passwordSalt || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return res.status(401).json({ error: "Неверный пароль" });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Введите корректный адрес почты" });
    if (email === (user.email ?? "").toLowerCase()) return res.status(400).json({ error: "Это уже ваш адрес" });

    const taken = await findUserByEmail(email);
    if (taken && taken.id !== req.uid) return res.status(409).json({ error: "Этот адрес уже привязан к другому аккаунту" });

    const updated = await updateUser(req.uid, { email });
    // Уведомление остаётся: смена почты — это смена того, куда придёт
    // восстановление доступа, и след об этом должен быть виден владельцу.
    try {
      const chat = await findOrCreateDm(req.uid, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `📧 Адрес почты изменён на ${email}.\n\nЕсли это были не вы — немедленно смените пароль.`);
    } catch (err) {
      console.error("email change notice failed:", err);
    }
    res.json({ user: selfUser(updated), changed: true });
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

    // Deliberately not routed through finishLogin(): a QR login is only ever
    // confirmed *from an already-signed-in device* (see /qr/confirm below), so
    // whoever completed it already holds a live session on this account. A TOTP
    // prompt here would gate nothing an attacker hasn't already passed, while
    // costing the owner a code on every desktop sign-in.
    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ status: "confirmed", user: selfUser(user) });
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
    return finishLogin(req, res, user);
  })
);

// Восстановление по паре «почта + телефон», без кода вообще.
//
// Названо честно: это самый слабый из трёх путей, и вот почему. Ни почта, ни
// номер не являются секретами — их знают магазины, банки, любой сервис, где
// оставляли контакты, и попадают они в утечки чаще всего прочего. Пара из двух
// несекретов остаётся несекретом, так что аккаунт достаётся тому, кто знает обе
// строки. Остальные два пути (код в письме, код в чат Shalter) требуют доступа
// к чему-то, а не знания о чём-то, — потому и надёжнее.
//
// Раз путь всё-таки нужен, цена ошибки снижена всем, чем можно: пара обязана
// совпасть целиком и принадлежать одному аккаунту; аккаунт с двухфакторной
// аутентификацией так не восстанавливается вовсе; все сеансы завершаются, чтобы
// смена пароля не прошла незамеченной для того, кто в аккаунте сидит; владельцу
// уходит уведомление и в чат, и на почту. Частота попыток ограничена authLimiter
// (server/index.js) — перебор пар работать не должен.
router.post(
  "/recover/pair/check",
  asyncRoute(async (req, res) => {
    const found = await findByPair(req.body);
    if (!found.user) return res.status(found.status).json({ error: found.error });
    res.json({ ok: true, name: found.user.name });
  })
);

router.post(
  "/recover/pair/reset",
  asyncRoute(async (req, res) => {
    const password = String(req.body?.password ?? "");
    if (password.length < 6) return res.status(400).json({ error: "Пароль — не короче 6 символов" });

    // Пара проверяется заново, а не «раз уж прошли первый шаг»: первый шаг
    // ничего не выдаёт и ни к чему не обязывает, вся проверка живёт здесь.
    const found = await findByPair(req.body);
    if (!found.user) return res.status(found.status).json({ error: found.error });
    const user = found.user;

    const { hash, salt } = hashPassword(password);
    await updateUser(user.id, { passwordHash: hash, passwordSalt: salt });
    await revokeAllSessions(user.id);

    const when = new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    try {
      const chat = await findOrCreateDm(user.id, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        `🔐 Пароль изменён через восстановление по почте и номеру телефона (${when}). Все сеансы завершены.\n\nЕсли это были не вы — восстановите доступ и включите двухфакторную аутентификацию: Настройки → Конфиденциальность. С ней этот способ восстановления не работает.`
      );
    } catch (err) {
      console.error("pair recovery notice failed:", err);
    }
    // Письмо — второй, независимый канал: если аккаунт уводят, чат злоумышленник
    // видит, а почту нет. Не обязано дойти, чтобы восстановление состоялось.
    if (user.email) {
      sendMail({
        to: user.email,
        subject: "Пароль в Shalter изменён",
        text:
          `Пароль вашего аккаунта Shalter изменён ${when} через восстановление по адресу почты и номеру телефона.\n\n` +
          `Если это были не вы — войдите и смените пароль, а затем включите двухфакторную аутентификацию: Настройки → Конфиденциальность. С ней этот способ восстановления не работает.`,
      }).catch((err) => console.error("pair recovery mail failed:", err));
    }

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: selfUser(user) });
  })
);

// Общая проверка пары для обоих шагов выше. Возвращает либо пользователя, либо
// готовый отказ.
async function findByPair(body) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body?.phone);
  if (!EMAIL_RE.test(email)) return { status: 400, error: "Введите корректный адрес почты" };
  if (!PHONE_RE.test(phone)) return { status: 400, error: "Введите номер телефона полностью" };

  const user = await findUserByEmail(email);
  // Одинаковый отказ на «нет такого адреса», «номер не тот» и «аккаунт без
  // номера»: иначе эндпоинт превращается в справочную, где по разнице ответов
  // выясняют, какой адрес существует и какой номер к нему привязан.
  const MISMATCH = { status: 400, error: "Почта и телефон не совпадают ни с одним аккаунтом" };
  if (!user || !user.phone || normalizePhone(user.phone) !== phone) return MISMATCH;
  if (user.isBanned) return { status: 403, error: banError(user) };
  if (user.twoFactorEnabled) {
    return {
      status: 409,
      error: "На аккаунте включена двухфакторная аутентификация — этот способ для него отключён. Войдите с кодом или используйте код восстановления.",
    };
  }
  return { user };
}

// The same thing by phone number instead of e-mail — for accounts whose address
// is private, or where mail simply isn't set up on the server.
//
// Said plainly, because it decides the whole shape: a phone number alone cannot
// be enough. Numbers are not secret — they are in the app, in people's contact
// lists, on business cards — so "type a number, set a password" would hand every
// account to anyone who knows one. What makes this recovery rather than a
// giveaway is the code, and the code goes to the account's own Shalter chat.
// That means it works when you are still signed in somewhere (another phone, a
// desktop) and have only forgotten the password — which is what "I forgot my
// password" usually is.
router.post(
  "/recover/phone/start",
  asyncRoute(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: "Введите номер телефона полностью" });

    const user = await findUserByPhone(phone);
    // Same answer either way — otherwise this endpoint answers "does this number
    // have a Shalter account" for any number anyone cares to try.
    if (!user || user.isBanned) return res.json({ ok: true, sent: true });
    if (user.twoFactorEnabled) {
      return res.status(409).json({
        error: "На аккаунте включена двухфакторная аутентификация — войдите с кодом из приложения или используйте код восстановления.",
      });
    }

    const code = codeLogins.createCode(user.id);
    const chat = await findOrCreateDm(user.id, SYSTEM_BOT_ID);
    await sendMessageAndBroadcast(
      chat,
      SYSTEM_BOT_ID,
      `🔢 Код для смены пароля: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.\n\nЕсли вы не запрашивали смену пароля — просто не вводите код, пароль останется прежним.`
    );
    res.json({ ok: true, sent: true });
  })
);

router.post(
  "/recover/phone/verify",
  asyncRoute(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password ?? "");
    if (password.length < 6) return res.status(400).json({ error: "Пароль — не короче 6 символов" });

    const user = await findUserByPhone(phone);
    if (!user || !codeLogins.verify(user.id, req.body?.code)) {
      return res.status(400).json({ error: "Неверный или устаревший код" });
    }
    if (user.isBanned) return res.status(403).json({ error: banError(user) });
    if (user.twoFactorEnabled) return res.status(409).json({ error: "На аккаунте включена двухфакторная аутентификация" });

    const { hash, salt } = hashPassword(password);
    await updateUser(user.id, { passwordHash: hash, passwordSalt: salt });
    await revokeAllSessions(user.id);

    try {
      const chat = await findOrCreateDm(user.id, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        "🔐 Пароль изменён по коду из этого чата, все остальные сеансы завершены.\n\nЕсли это были не вы — смените пароль и включите двухфакторную аутентификацию: Настройки → Конфиденциальность."
      );
    } catch (err) {
      console.error("recovery notice failed:", err);
    }

    return finishLogin(req, res, await getUser(user.id));
  })
);

// ── Two-factor authentication (RFC 6238 TOTP — see server/lib/totp.js) ──────
//
// The problem it solves: every other way into an account here leans on a phone
// number somewhere, and a phone number isn't a secret — it's on profiles, it's
// in people's contact lists, it gets reused across services. With 2FA on, an
// attacker who has the number, the email, and even the password still can't get
// in without the rotating code from the owner's own authenticator app.

// Posts a fresh confirmation code into the account's own Shalter service chat —
// the same channel login codes and security alerts already use.
//
// What this is worth, stated plainly: it proves whoever is typing can read that
// account's chats, i.e. already holds a signed-in device. Against someone who
// has only the password (the common case: reused or leaked) that is a real
// second factor. Against someone already inside a session it is not — an
// authenticator app is stronger, which is why both are offered rather than this
// one replacing it.
async function sendTwoFactorCode(userId) {
  const code = codeLogins.createCode(userId);
  const chat = await findOrCreateDm(userId, SYSTEM_BOT_ID);
  await sendMessageAndBroadcast(
    chat,
    SYSTEM_BOT_ID,
    `🔢 Код подтверждения: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.`
  );
}

// One check for both methods, so every place that accepts a second factor
// (enable, disable, login) treats them identically.
async function verifySecondFactor(user, rawCode) {
  // Облачный пароль сверяется как есть, без trim: пробел в начале или в конце —
  // такой же знак пароля, как любой другой, и молча его срезать значит не
  // пустить человека с его собственным паролем.
  if (user.twoFactorMethod === "password") {
    if (!user.cloudPasswordHash || !user.cloudPasswordSalt) return false;
    return verifyPassword(String(rawCode ?? ""), user.cloudPasswordHash, user.cloudPasswordSalt);
  }
  const cleaned = String(rawCode ?? "").trim();
  if (user.twoFactorMethod === "chat") return codeLogins.verify(user.id, cleaned);
  return totp.verifyCode(user.totpSecret, cleaned);
}

function currentUserOr401(req, res) {
  const uid = getCurrentUserId(req);
  if (!uid) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return uid;
}

router.get(
  "/2fa",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    res.json({
      enabled: !!me.twoFactorEnabled,
      method: me.twoFactorMethod ?? "totp",
      // A secret generated but never confirmed — the UI offers to resume rather
      // than silently starting over with a different one.
      pending: !!me.totpSecret && !me.totpEnabledAt,
      // Подсказку своему же аккаунту показать можно и нужно: по ней человек
      // проверяет, что она понятна ему и бесполезна остальным.
      cloudPasswordHint: me.twoFactorMethod === "password" ? me.cloudPasswordHint || "" : "",
      recoveryCodesLeft: me.twoFactorEnabled ? (me.totpRecoveryCodes ?? []).length : 0,
      enabledAt: me.totpEnabledAt ?? null,
    });
  })
);

// Step 1: mint a secret and hand back the otpauth:// URI for the QR code. Not
// enabled yet — /2fa/enable below requires a working code first, so scanning the
// QR and then closing the app can't leave the account needing a code nobody has.
router.post(
  "/2fa/setup",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (me.twoFactorEnabled) return res.status(400).json({ error: "Двухфакторная аутентификация уже включена" });

    // "chat" needs no secret and no QR: the code is minted per attempt and
    // posted into the Shalter service chat, so setup is just "send me one".
    if (req.body?.method === "chat") {
      await startChatTwoFactor(uid);
      await sendTwoFactorCode(uid);
      return res.json({ method: "chat" });
    }

    const secret = totp.generateSecret();
    await startTotpSetup(uid, secret);
    res.json({ method: "totp", secret, otpauthUri: totp.otpauthUri(secret, me.username || me.phone || me.name) });
  })
);

// Re-send, for both the setup step and the login step. Separate from /setup so
// asking for another code doesn't reset the method or invalidate a secret that
// is already in someone's authenticator app.
router.post(
  "/2fa/send-code",
  asyncRoute(async (req, res) => {
    // Either an authenticated user (turning it on, or turning it off) or a
    // half-finished login holding a ticket — the ticket names the account, so no
    // session is needed and none is granted.
    const ticketEntry = req.body?.ticket ? twoFactorTickets.peek(req.body.ticket) : null;
    const uid = ticketEntry?.userId ?? getCurrentUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if ((me.twoFactorMethod ?? "totp") !== "chat") {
      return res.status(400).json({ error: "Этот аккаунт подтверждает вход кодом из приложения-аутентификатора" });
    }
    await sendTwoFactorCode(uid);
    res.json({ ok: true });
  })
);

// Облачный пароль: задать, сменить и снять.
//
// Отдельные маршруты, а не общий /2fa/enable, потому что подтверждать тут
// нечего: у аутентификатора есть секрет, который надо доказать кодом, а
// облачный пароль человек придумывает сам — и «доказательством» служит то, что
// он ввёл его дважды и знает пароль от аккаунта.
//
// Пароль от аккаунта спрашивается обязательно: без этого любой, кто добрался до
// незапертого устройства с открытым Shalter, поставил бы свой облачный пароль и
// запер владельца снаружи.
const MIN_CLOUD_PASSWORD = 6;
const MAX_CLOUD_HINT = 100;

router.post(
  "/2fa/cloud-password",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });

    const accountPassword = String(req.body?.accountPassword ?? "");
    if (!me.passwordHash || !me.passwordSalt || !verifyPassword(accountPassword, me.passwordHash, me.passwordSalt)) {
      return res.status(403).json({ error: "Неверный пароль от аккаунта" });
    }
    // Смена уже установленного облачного пароля требует и старый: пароль от
    // аккаунта мог остаться в чужой памяти с прошлого входа, а смысл второго
    // шага в том, чтобы одного его не хватало.
    if (me.twoFactorMethod === "password" && me.cloudPasswordHash) {
      const current = String(req.body?.currentPassword ?? "");
      if (!verifyPassword(current, me.cloudPasswordHash, me.cloudPasswordSalt)) {
        return res.status(403).json({ error: "Неверный текущий облачный пароль" });
      }
    }
    if (me.twoFactorEnabled && me.twoFactorMethod !== "password") {
      return res.status(400).json({ error: "Сначала отключите текущий способ подтверждения входа" });
    }

    const password = String(req.body?.password ?? "");
    if (password.length < MIN_CLOUD_PASSWORD) {
      return res.status(400).json({ error: `Облачный пароль — не короче ${MIN_CLOUD_PASSWORD} знаков` });
    }
    if (password === accountPassword) {
      return res.status(400).json({ error: "Облачный пароль должен отличаться от пароля аккаунта — иначе второй шаг ничего не добавляет" });
    }
    const hint = String(req.body?.hint ?? "").trim().slice(0, MAX_CLOUD_HINT);
    // Подсказку видно до входа, поэтому она не должна быть самим паролем.
    // Проверка нестрогая по регистру: «МойПароль» в подсказке выдаёт «мойпароль»
    // ничуть не меньше.
    if (hint && hint.toLowerCase() === password.toLowerCase()) {
      return res.status(400).json({ error: "Подсказка не должна повторять сам пароль — её видно до входа" });
    }

    const { hash, salt } = hashPassword(password);
    await updateUser(uid, {
      cloudPasswordHash: hash,
      cloudPasswordSalt: salt,
      cloudPasswordHint: hint || null,
      twoFactorMethod: "password",
    });
    // Второй шаг только что появился — на всех прочих устройствах он не
    // спрашивался, и сессии там выданы без него. Оставить их — значит включить
    // защиту, которая не защищает ровно от того, ради чего её включали.
    await revokeOtherSessions(uid, req.cookies?.device_id ?? null).catch(() => {});

    // Перечитываем и отвечаем тем, что получилось на самом деле, а не тем, что
    // собирались сделать. Так уже было: updateUser молча выбрасывает поля не из
    // своего белого списка, twoFactorMethod в него не входил — хэш записывался,
    // способ нет, и маршрут бодро отвечал «включено», пока вход спрашивать
    // пароль даже не начинал. Ответ, собранный из намерений, такую поломку
    // прячет; собранный из состояния — показывает.
    const saved = await getUser(uid);
    if (!saved?.twoFactorEnabled || saved.twoFactorMethod !== "password") {
      return res.status(500).json({ error: "Не удалось включить облачный пароль — попробуйте ещё раз" });
    }
    res.json({ ok: true, enabled: true, method: saved.twoFactorMethod, hint: saved.cloudPasswordHint || null });
  })
);

router.post(
  "/2fa/cloud-password/disable",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (me.twoFactorMethod !== "password" || !me.cloudPasswordHash) {
      return res.status(400).json({ error: "Облачный пароль не установлен" });
    }
    if (!verifyPassword(String(req.body?.password ?? ""), me.cloudPasswordHash, me.cloudPasswordSalt)) {
      return res.status(403).json({ error: "Неверный облачный пароль" });
    }
    await updateUser(uid, { cloudPasswordHash: null, cloudPasswordSalt: null, cloudPasswordHint: null });
    res.json({ ok: true, enabled: false });
  })
);

// Подсказка к облачному паролю для экрана входа. По билету, а не по сессии:
// сессии на этом шаге ещё нет и не должно быть. Билет уже доказывает, что
// первый шаг пройден, — то есть пароль от аккаунта человек знает.
router.post(
  "/2fa/hint",
  asyncRoute(async (req, res) => {
    const entry = req.body?.ticket ? twoFactorTickets.peek(req.body.ticket) : null;
    if (!entry) return res.status(400).json({ error: "Срок ожидания истёк — войдите заново" });
    const user = await getUser(entry.userId);
    if (!user || user.twoFactorMethod !== "password") return res.json({ hint: null });
    res.json({ hint: user.cloudPasswordHint || null });
  })
);

// Step 2: prove the authenticator app really has the secret, then turn it on and
// show the recovery codes once. They're stored hashed, so this response is the
// only time they exist in readable form.
router.post(
  "/2fa/enable",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (me.twoFactorEnabled) return res.status(400).json({ error: "Двухфакторная аутентификация уже включена" });
    const byChat = me.twoFactorMethod === "chat";
    if (!byChat && !me.totpSecret) return res.status(400).json({ error: "Сначала отсканируйте QR-код" });
    if (!(await verifySecondFactor(me, req.body?.code))) {
      return res.status(400).json({
        error: byChat
          ? "Неверный или устаревший код — запросите новый"
          : "Неверный код — проверьте, что время на устройстве точное, и попробуйте снова",
      });
    }

    const recoveryCodes = totp.generateRecoveryCodes();
    await enableTotp(uid, recoveryCodes.map(totp.hashRecoveryCode));

    // Same service-chat notification as a new-device login: turning 2FA on is a
    // security-relevant change, and the owner should see it happen even if it
    // wasn't them who did it.
    try {
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, uid);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        "🔐 На вашем аккаунте включена двухфакторная аутентификация. Если это были не вы — немедленно смените пароль."
      );
    } catch (err) {
      console.error("2fa enable notification failed:", err);
    }

    res.json({ enabled: true, recoveryCodes });
  })
);

// Turning it off requires a current code (or a recovery code) — otherwise
// anyone who got hold of an open session could just switch the protection off,
// which would leave 2FA protecting nothing.
router.post(
  "/2fa/disable",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (!me.twoFactorEnabled) {
      // A half-finished setup has nothing to confirm against, so it can just be
      // dropped.
      await disableTotp(uid);
      return res.json({ enabled: false });
    }

    const code = String(req.body?.code ?? "");
    // Облачный пароль снимается тем же «Отключить», что и остальные способы, —
    // человеку незачем знать, что внутри это разные механизмы. Проверяем сам
    // пароль и чистим его поля: disableTotp ниже трогает только totp, и без
    // этой ветки «отключено» означало бы, что вход по-прежнему спрашивает
    // пароль, которого в настройках уже нет.
    if (me.twoFactorMethod === "password") {
      if (!verifyPassword(code, me.cloudPasswordHash, me.cloudPasswordSalt)) {
        return res.status(400).json({ error: "Неверный облачный пароль" });
      }
      await updateUser(uid, { cloudPasswordHash: null, cloudPasswordSalt: null, cloudPasswordHint: null });
      await disableTotp(uid);
      return res.json({ enabled: false });
    }

    const ok = totp.verifyCode(me.totpSecret, code) || (await consumeRecoveryCode(uid, totp.hashRecoveryCode(code)));
    if (!ok) return res.status(400).json({ error: "Неверный код" });

    await disableTotp(uid);
    try {
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, uid);
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, "🔓 Двухфакторная аутентификация отключена. Если это были не вы — срочно смените пароль.");
    } catch (err) {
      console.error("2fa disable notification failed:", err);
    }
    res.json({ enabled: false });
  })
);

// The second step of logging in: trade a ticket from finishLogin() plus a code
// for an actual session. Accepts a recovery code in the same field, since
// someone reaching for one has lost access to the authenticator and shouldn't
// have to find a different screen.
router.post(
  "/2fa/login",
  asyncRoute(async (req, res) => {
    const { ticket, code } = req.body ?? {};
    const entry = twoFactorTickets.peek(ticket);
    if (!entry) return res.status(400).json({ error: "Время на ввод кода истекло — войдите заново" });

    const user = await getUser(entry.userId);
    if (!user) return res.status(400).json({ error: "Время на ввод кода истекло — войдите заново" });
    // Re-checked here, not just at the first step: a ban can land in between.
    if (user.isBanned) {
      twoFactorTickets.consume(ticket);
      return res.status(403).json({ error: banError(user) });
    }

    const cleaned = String(code ?? "").trim();
    const ok =
      (await verifySecondFactor(user, cleaned)) || (await consumeRecoveryCode(user.id, totp.hashRecoveryCode(cleaned)));
    if (!ok) {
      const attemptsLeft = twoFactorTickets.countFailure(ticket);
      return res.status(400).json({
        error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : "Слишком много неверных кодов — войдите заново",
        attemptsLeft,
      });
    }

    twoFactorTickets.consume(ticket);
    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: selfUser(user) });
  })
);

module.exports = router;
