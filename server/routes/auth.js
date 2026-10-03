const express = require("express");
const { genId } = require("../lib/genId");
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
const { findUserByEmail, findUserByPhone, findUserByReferralCode, createUser, getUser, updateUser, grantPremiumDays, startTotpSetup, startChatTwoFactor, enableTotp, disableTotp, consumeRecoveryCode, scheduleAccountDeletion, cancelAccountDeletion } = require("../data/users");
const { publicUser, selfUser } = require("../data/sanitize");
const { hashPassword, verifyPassword } = require("../security");
const { listSessions, getSession, upsertSession, revokeAllSessions, revokeOtherSessions } = require("../data/sessions");
const { parseUserAgent } = require("../lib/userAgent");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { deleteAccount } = require("../lib/deleteAccount");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { PREMIUM_GRANT_DAYS, isAdminPhone } = require("../config");
const qrLogins = require("../data/qrLogins");
const codeLogins = require("../data/codeLogins");
const passkeys = require("../data/passkeys");
const webauthn = require("../lib/webauthn");

const { EMAIL_RE, PHONE_RE, normalizePhone } = require("../lib/validators");
const { checkUsername, normalizeUsername, isUsernameConflict } = require("../lib/username");
const totp = require("../lib/totp");
const twoFactorTickets = require("../data/twoFactorTickets");
const emailChanges = require("../data/emailChanges");
const { sendMail } = require("../lib/mailer");

const router = express.Router();

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

async function finishLogin(req, res, user) {
  if (user.twoFactorEnabled) {
    const { ticket, expiresInSec } = twoFactorTickets.create(user.id);
    const method = user.twoFactorMethod ?? "totp";
    if (method === "chat") await sendTwoFactorCode(user.id).catch((err) => console.error("2fa code send failed:", err));
    return res.json({
      twoFactorRequired: true,
      ticket,
      expiresInSec,
      name: user.name,
      method,
      hint: method === "password" ? user.cloudPasswordHint || null : null,
      scheduledDeletionAt: user.scheduledDeletionAt ?? null,
    });
  }
  const alreadyLinked = addAccountSession(req, res, user.id);
  await recordSession(req, res, user.id);
  return res.json({ user: selfUser(user), alreadyLinked });
}

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
    const { name, email, password, phone, username, referralCode, lastName } = req.body ?? {};

    if (!name?.trim()) return res.status(400).json({ error: "Введите имя" });
    const cleanLast = String(lastName ?? "").trim().slice(0, 60);
    const fullName = [name.trim(), cleanLast].filter(Boolean).join(" ");
    if (!EMAIL_RE.test(email ?? "")) return res.status(400).json({ error: "Некорректный email" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
    }
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
    // Номер не подтверждается, а админ определяется по номеру: регистрация на
    // админский номер возможна, только если явно разрешена в окружении.
    if (isAdminPhone(normalizedPhone) && process.env.ALLOW_ADMIN_PHONE_SIGNUP !== "1") {
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
        id: genId("u"),
        name: fullName,
        lastName: cleanLast || undefined,
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
        premiumUntil: referrer ? new Date(Date.now() + PREMIUM_GRANT_DAYS * 86400000).toISOString() : undefined,
      });
    } catch (err) {
      if (isUsernameConflict(err)) return res.status(409).json({ error: "Этот юзернейм уже занят" });
      throw err;
    }

    if (cleanLast) {
      await updateUser(user.id, { lastName: cleanLast });
      user = { ...user, lastName: cleanLast };
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

    const deviceId = getOrCreateDeviceId(req, res);
    const revoked = new Set(
      (await Promise.all(ids.map(async (id) => ((await getSession(id, deviceId))?.revokedAt ? id : null)))).filter(Boolean)
    );
    const accountUsers = (await Promise.all(ids.filter((id) => !revoked.has(id)).map((id) => getUser(id)))).filter((u) => u !== undefined);

    if (!uid || revoked.has(uid)) return res.json({ user: null, accounts: accountUsers.map(selfUser) });
    const user = await getUser(uid);
    res.json({
      user: user ? selfUser(user) : null,
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
    // Если на устройстве есть другие аккаунты — переключаемся на следующий.
    const remaining = removeAccountSession(req, res, req.uid);
    res.json({ ok: true, remaining });
  })
);

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
    try {
      const chat = await findOrCreateDm(req.uid, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `📧 Адрес почты изменён на ${email}.\n\nЕсли это были не вы — немедленно смените пароль.`);
    } catch (err) {
      console.error("email change notice failed:", err);
    }
    res.json({ user: selfUser(updated), changed: true });
  })
);

router.post(
  "/qr/start",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    const token = qrLogins.createToken(deviceId);
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({ token, loginUrl: `${origin}/qr-login?token=${token}` });
  })
);

router.get(
  "/qr/poll",
  asyncRoute(async (req, res) => {
    const { token } = req.query;
    const entry = qrLogins.getEntry(String(token ?? ""));
    if (!entry) return res.json({ status: "expired" });
    if (!entry.confirmedUserId) return res.json({ status: "pending" });

    // QR-код виден на экране: войти по нему должно только то устройство, которое его показало.
    if (entry.deviceId !== getOrCreateDeviceId(req, res)) return res.json({ status: "expired" });
    const consumed = qrLogins.consume(String(token));
    if (!consumed) return res.json({ status: "pending" });
    const user = await getUser(consumed.confirmedUserId);
    if (!user) return res.json({ status: "expired" });
    if (user.isBanned) return res.json({ status: "banned", error: banError(user) });

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ status: "confirmed", user: selfUser(user) });
  })
);

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

// --- Ключи доступа (passkeys) ---
router.post(
  "/passkey/register/start",
  requireUserId,
  asyncRoute(async (req, res) => {
    const user = await getUser(req.uid);
    if (!user) return res.status(404).json({ error: "not found" });
    const existing = passkeys.listPasskeys(user.id);
    if (existing.length >= passkeys.MAX_PER_USER) return res.status(400).json({ error: `Не больше ${passkeys.MAX_PER_USER} ключей` });
    const { rpId } = webauthn.rpFor(req);
    res.json({
      challenge: webauthn.newChallenge("register", user.id),
      rp: { id: rpId, name: "Shalter" },
      user: { id: webauthn.b64url(Buffer.from(user.id)), name: user.username || user.phone || user.email || user.name, displayName: user.name || "Shalter" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
      attestation: "none",
      timeout: 120000,
      excludeCredentials: existing.map((p) => ({ type: "public-key", id: p.id })),
    });
  })
);

router.post(
  "/passkey/register/finish",
  requireUserId,
  asyncRoute(async (req, res) => {
    const { rpId, origin } = webauthn.rpFor(req);
    let result;
    try {
      result = webauthn.verifyRegistration(req.body ?? {}, { origin, rpId, userId: req.uid });
    } catch (err) {
      return res.status(400).json({ error: `Не удалось добавить ключ: ${err.message}` });
    }
    const name = String(req.body?.name ?? "").trim().slice(0, 60) || parseUserAgent(req.headers["user-agent"]);
    const added = passkeys.addPasskey({ id: result.credentialId, userId: req.uid, publicKey: result.publicKey, signCount: result.signCount, name });
    if (!added) return res.status(409).json({ error: "Этот ключ уже добавлен" });
    try {
      const chat = await findOrCreateDm(req.uid, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `🔑 К аккаунту добавлен ключ доступа «${added.name}». Если это были не вы — удалите его в Настройки → Конфиденциальность и завершите чужие сеансы.`);
    } catch {}
    res.json({ passkey: { id: added.id, name: added.name, createdAt: added.createdAt } });
  })
);

router.get(
  "/passkeys",
  requireUserId,
  asyncRoute(async (req, res) => {
    res.json({ passkeys: passkeys.listPasskeys(req.uid).map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt })) });
  })
);

router.delete(
  "/passkeys/:id",
  requireUserId,
  asyncRoute(async (req, res) => {
    if (!passkeys.deletePasskey(req.uid, req.params.id)) return res.status(404).json({ error: "Ключ не найден" });
    res.json({ ok: true });
  })
);

router.post(
  "/passkey/login/start",
  asyncRoute(async (req, res) => {
    const { rpId } = webauthn.rpFor(req);
    res.json({ challenge: webauthn.newChallenge("login"), rpId, userVerification: "preferred", timeout: 120000 });
  })
);

router.post(
  "/passkey/login/finish",
  asyncRoute(async (req, res) => {
    const passkey = typeof req.body?.id === "string" ? passkeys.getPasskey(req.body.id) : null;
    if (!passkey) return res.status(401).json({ error: "Этот ключ не привязан ни к одному аккаунту" });
    const { rpId, origin } = webauthn.rpFor(req);
    let signCount;
    try {
      ({ signCount } = webauthn.verifyAssertion(req.body ?? {}, { origin, rpId, passkey }));
    } catch (err) {
      return res.status(401).json({ error: `Вход по ключу не удался: ${err.message}` });
    }
    passkeys.touchPasskey(passkey.id, signCount);
    const user = await getUser(passkey.userId);
    if (!user) return res.status(401).json({ error: "Аккаунт не найден" });
    if (user.isBanned) return res.status(403).json({ error: banError(user) });
    return finishLogin(req, res, user);
  })
);

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

async function findByPair(body) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body?.phone);
  if (!EMAIL_RE.test(email)) return { status: 400, error: "Введите корректный адрес почты" };
  if (!PHONE_RE.test(phone)) return { status: 400, error: "Введите номер телефона полностью" };

  const user = await findUserByEmail(email);
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

router.post(
  "/recover/phone/start",
  asyncRoute(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: "Введите номер телефона полностью" });

    const user = await findUserByPhone(phone);
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

async function sendTwoFactorCode(userId) {
  const code = codeLogins.createCode(userId);
  const chat = await findOrCreateDm(userId, SYSTEM_BOT_ID);
  await sendMessageAndBroadcast(
    chat,
    SYSTEM_BOT_ID,
    `🔢 Код подтверждения: ${code}\n\nНикому не сообщайте его — даже сотрудникам Shalter. Действует 5 минут.`
  );
  // Пока приложение свёрнуто (переключились ввести код), WebSocket спит — без пуша код «не приходит».
  const { sendPushToUser, MESSAGE_PUSH } = require("../push");
  sendPushToUser(
    userId,
    { title: "Shalter", body: `Код подтверждения: ${code}. Никому его не сообщайте.`, url: `/chat/${chat.id}`, tag: "shalter-login-code" },
    { ...MESSAGE_PUSH, TTL: 5 * 60 }
  ).catch(() => {});
}

async function verifySecondFactor(user, rawCode) {
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
      pending: !!me.totpSecret && !me.totpEnabledAt,
      cloudPasswordHint: me.twoFactorMethod === "password" ? me.cloudPasswordHint || "" : "",
      recoveryCodesLeft: me.twoFactorEnabled ? (me.totpRecoveryCodes ?? []).length : 0,
      enabledAt: me.totpEnabledAt ?? null,
    });
  })
);

router.post(
  "/2fa/setup",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (me.twoFactorEnabled) return res.status(400).json({ error: "Двухфакторная аутентификация уже включена" });

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

router.post(
  "/2fa/send-code",
  asyncRoute(async (req, res) => {
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
    await revokeOtherSessions(uid, req.cookies?.device_id ?? null).catch(() => {});

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
    const confirmedByPhone =
      byChat && !!me.phone && normalizePhone(String(req.body?.code ?? "")) === normalizePhone(me.phone);
    if (!confirmedByPhone && !(await verifySecondFactor(me, req.body?.code))) {
      return res.status(400).json({
        error: byChat
          ? "Неверный код или номер — введите код из чата либо номер телефона аккаунта"
          : "Неверный код — проверьте, что время на устройстве точное, и попробуйте снова",
      });
    }

    const recoveryCodes = totp.generateRecoveryCodes();
    await enableTotp(uid, recoveryCodes.map(totp.hashRecoveryCode));

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

router.post(
  "/2fa/disable",
  asyncRoute(async (req, res) => {
    const uid = currentUserOr401(req, res);
    if (!uid) return;
    const me = await getUser(uid);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (!me.twoFactorEnabled) {
      await disableTotp(uid);
      return res.json({ enabled: false });
    }

    const code = String(req.body?.code ?? "");
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

router.post(
  "/2fa/login",
  asyncRoute(async (req, res) => {
    const { ticket, code } = req.body ?? {};
    const entry = twoFactorTickets.peek(ticket);
    if (!entry) return res.status(400).json({ error: "Время на ввод кода истекло — войдите заново" });

    const user = await getUser(entry.userId);
    if (!user) return res.status(400).json({ error: "Время на ввод кода истекло — войдите заново" });
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
    const alreadyLinked = addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: selfUser(user), alreadyLinked });
  })
);

const DELETION_DELAY_DAYS = 7;
router.post(
  "/schedule-deletion",
  asyncRoute(async (req, res) => {
    const entry = twoFactorTickets.peek(req.body?.ticket);
    if (!entry) return res.status(400).json({ error: "Время на подтверждение истекло — войдите заново" });
    const user = await getUser(entry.userId);
    if (!user) return res.status(400).json({ error: "Аккаунт не найден" });

    const deleteAt = new Date(Date.now() + DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    scheduleAccountDeletion(user.id, deleteAt);
    twoFactorTickets.consume(req.body.ticket);

    try {
      const chat = await findOrCreateDm(user.id, SYSTEM_BOT_ID);
      const when = new Date(deleteAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        `⚠️ Запрошено удаление аккаунта — он будет удалён ${when}. Если передумаете, просто войдите в аккаунт до этой даты — удаление отменится.`
      );
    } catch {
    }
    res.json({ deleteAt });
  })
);

router.post(
  "/cancel-deletion",
  asyncRoute(async (req, res) => {
    const entry = twoFactorTickets.peek(req.body?.ticket);
    if (!entry) return res.status(400).json({ error: "Время на подтверждение истекло — войдите заново" });
    const user = await getUser(entry.userId);
    if (!user) return res.status(400).json({ error: "Аккаунт не найден" });

    cancelAccountDeletion(user.id);
    try {
      const chat = await findOrCreateDm(user.id, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, "✅ Удаление аккаунта отменено.");
    } catch {
    }
    res.json({ ok: true });
  })
);

module.exports = router;
