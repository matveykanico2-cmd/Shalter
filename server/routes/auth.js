const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const {
  getCurrentUserId,
  getSessionUserIds,
  addAccountSession,
  switchActiveAccount,
  removeAccountSession,
  getOrCreateDeviceId,
} = require("../middleware/auth");
const { findUserByEmail, createUser, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { hashPassword, verifyPassword } = require("../security");
const { upsertSession } = require("../data/sessions");
const { parseUserAgent } = require("../lib/userAgent");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Records/refreshes the Settings → Devices entry for this (account, browser)
// pair. Called on every event that establishes or resumes an authenticated
// session on this device — login, register, switch.
function recordSession(req, res, userId) {
  const deviceId = getOrCreateDeviceId(req, res);
  return upsertSession({
    userId,
    deviceId,
    device: parseUserAgent(req.headers["user-agent"]),
    location: req.ip || "неизвестно",
  });
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

    addAccountSession(req, res, user.id);
    await recordSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  })
);

router.post(
  "/register-email",
  asyncRoute(async (req, res) => {
    const { name, email, password } = req.body ?? {};

    if (!name?.trim()) return res.status(400).json({ error: "Введите имя" });
    if (!EMAIL_RE.test(email ?? "")) return res.status(400).json({ error: "Некорректный email" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: "Аккаунт с таким email уже существует" });
    }

    const { hash, salt } = hashPassword(password);
    const user = await createUser({
      id: `u_${Date.now()}`,
      name: name.trim(),
      username: name.trim().toLowerCase().replace(/\s+/g, "_"),
      phone: "",
      email: email.trim().toLowerCase(),
      passwordHash: hash,
      passwordSalt: salt,
      avatarColor: "#2E56D9",
      bio: "",
      online: true,
      lastSeen: new Date().toISOString(),
    });

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

module.exports = router;
