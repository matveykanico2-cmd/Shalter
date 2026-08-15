const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const {
  getUser,
  findUserByPhone,
  findUserByUsername,
  setBanned,
  setSafetyLabel,
  setVerified,
  listBannedUsers,
  listLabeledUsers,
  updateUser,
  disableTotp,
} = require("../data/users");
const { hashPassword } = require("../security");
const { revokeAllSessions } = require("../data/sessions");
const { verifySmtp } = require("../lib/mailer");
const { buildDnsAdvice } = require("../lib/mailDns");
const { buildUserExport, logExport, listExports } = require("../data/dataExport");
const { deleteAccount } = require("../lib/deleteAccount");
const { listOpenReports, listReportsAboutUser } = require("../data/reports");
const { getMessage } = require("../data/messages");
const { getChat, updateChat } = require("../data/chats");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");

const router = express.Router();
router.use(requireUserId);

// Every route here is gated to whoever currently holds ADMIN_PHONE, checked
// fresh on each request (same convention as reports.js/premium.js — the
// phone can move to a different account, so it's never cached). This is the
// lawful-request compliance surface: a single admin, acting on a stated
// legal basis, exporting one named user's stored data. It deliberately has
// no "read everyone" or "live wiretap" capability — see server/data/
// dataExport.js's header for the boundary, especially around E2E.
async function requireAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!me || me.phone !== ADMIN_PHONE) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

// Resolve the target by id, @username, or phone — a court order names a
// person by handle/number, not by internal id, so accept all three.
async function resolveTarget(query) {
  const q = (query ?? "").trim();
  if (!q) return null;
  return (await getUser(q)) || (await findUserByUsername(q.replace(/^@/, ""))) || (await findUserByPhone(q)) || null;
}

// Look up a target without exporting yet — lets the admin UI confirm "this
// is the right person" (name/username/phone) before running, so a mistyped
// handle doesn't produce someone else's file.
router.get(
  "/lookup",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const target = await resolveTarget(req.query.q);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    res.json({ user: { id: target.id, name: target.name, username: target.username || null, phone: target.phone || null } });
  })
);

// The export itself. Requires a non-empty `reason` (the legal basis / case
// reference) — refusing to run without one is what keeps the audit log
// meaningful rather than a wall of blank entries. Returns the assembled
// data plus the audit-row id; the client turns it into a downloaded file.
router.post(
  "/export",
  asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { userId, reason } = req.body ?? {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: "Укажите основание (номер дела / реквизиты постановления) — оно записывается в журнал" });
    }
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const data = await buildUserExport(target.id);
    const log = logExport({ adminId: admin.id, targetUserId: target.id, reason: String(reason).trim(), messageCount: data.stats.messageCount });

    res.json({ exportId: log.id, data });
  })
);

// The transparency journal — every past export, newest first, with the
// admin who ran it and the target resolved to a readable label.
router.get(
  "/exports",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const rows = listExports();
    const withLabels = await Promise.all(
      rows.map(async (r) => {
        const [admin, target] = await Promise.all([getUser(r.adminId), getUser(r.targetUserId)]);
        return {
          id: r.id,
          at: r.createdAt,
          reason: r.reason,
          messageCount: r.messageCount,
          admin: admin ? { id: admin.id, name: admin.name } : { id: r.adminId },
          target: target ? { id: target.id, name: target.name, username: target.username || null } : { id: r.targetUserId },
        };
      })
    );
    res.json({ exports: withLabels });
  })
);

// ── Модерация ────────────────────────────────────────────────────────────────
// The review surface for bans and safety labels. Reports still arrive as
// messages in the admin's chat with the service bot (routes/reports.js) —
// that's the notification. This is the ledger: what's still open, who is
// currently banned and why, and who carries a public safety label. Without it
// a ban was a one-way door — the flag went up from a chat message that then
// scrolled away, and there was no screen anywhere that could take it back
// down.

// Must match server/db.js's safetyLabel comment and the client's own list in
// public/js/lib/safetyLabels.js.
const SAFETY_LABELS = new Set(["scam", "fake", "terrorism", "extremism", "drugs"]);

const REASON_LABELS = {
  spam: "Спам",
  scam: "Мошенничество",
  fake: "Поддельный аккаунт",
  violence: "Насилие или угрозы",
  terrorism: "Терроризм",
  extremism: "Экстремизм",
  drugs: "Продажа наркотиков",
  illegal: "Незаконный контент",
  child_safety: "Угроза безопасности детей",
  other: "Другое",
};

function userLabel(u, fallbackId) {
  if (!u) return { id: fallbackId, name: "(удалённый аккаунт)" };
  return {
    id: u.id,
    name: u.name,
    username: u.username || null,
    safetyLabel: u.safetyLabel || null,
    isBanned: !!u.isBanned,
    // Current Premium / ads state, so the admin panel on a profile
    // (public/js/components/adminUserPanel.js) can show what the account
    // already has before handing over a purchase the buyer just transferred
    // for — rather than granting blind and stacking a second month by mistake.
    isPremium: !!u.isPremium,
    premiumUntil: u.premiumUntil || null,
    premiumForever: !!u.premiumForever,
    isAdsActive: !!u.isAdsActive,
    adsUntil: u.adsUntil || null,
    adsForever: !!u.adsForever,
  };
}

// A report, resolved into something readable: who filed it, who it's about,
// and — for a reported message — what the message actually said, since "спам"
// on its own isn't a reason anyone can review.
async function decorateReport(r) {
  const [reporter, subject] = await Promise.all([getUser(r.reporterId), r.subjectUserId ? getUser(r.subjectUserId) : null]);
  let quoted = null;
  if (r.targetType === "message") {
    const m = await getMessage(r.targetId);
    quoted = m ? (m.text || "[вложение]").slice(0, 300) : "(сообщение удалено)";
  } else if (r.targetType === "chat") {
    const c = await getChat(r.targetId);
    quoted = c ? c.title || "(без названия)" : "(чат удалён)";
  }
  return {
    id: r.id,
    at: r.createdAt,
    status: r.status,
    reason: r.reason,
    reasonLabel: REASON_LABELS[r.reason] ?? r.reason,
    details: r.details || null,
    targetType: r.targetType,
    quoted,
    reporter: userLabel(reporter, r.reporterId),
    subject: r.subjectUserId ? userLabel(subject, r.subjectUserId) : null,
  };
}

router.get(
  "/moderation",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const [banned, labeled] = await Promise.all([listBannedUsers(), listLabeledUsers()]);
    const openReports = await Promise.all(listOpenReports().map(decorateReport));
    res.json({
      openReports,
      banned: banned.map((u) => ({ ...userLabel(u), bannedAt: u.bannedAt || null, banReason: u.banReason || null })),
      labeled: labeled.map((u) => ({ ...userLabel(u), safetyLabelAt: u.safetyLabelAt || null })),
      labels: [...SAFETY_LABELS],
    });
  })
);

// Every report filed against one account — what the admin reads *before*
// deciding whether a ban was right, and the answer to "покажи причину".
router.get(
  "/users/:id/reports",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    const reports = await Promise.all(listReportsAboutUser(target.id).map(decorateReport));
    res.json({
      user: { ...userLabel(target), bannedAt: target.bannedAt || null, banReason: target.banReason || null },
      reports,
    });
  })
);

// Ban or unban. Unbanning is the point of this route existing — a ban set
// from a report card had no counterpart anywhere. Both directions tell the
// user in their chat with the service bot, so being unbanned isn't something
// they have to discover by trying to log in again.
router.post(
  "/users/:id/ban",
  asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (target.id === admin.id) return res.status(400).json({ error: "Нельзя заблокировать самого себя" });

    const banned = req.body?.banned !== false;
    const reason = (req.body?.reason ?? "").trim();
    if (banned && !reason) return res.status(400).json({ error: "Укажите причину блокировки — её увидит пользователь" });

    const updated = await setBanned(target.id, banned, reason);

    // Best-effort: the notification is not what the ban depends on, so a
    // failure here must not roll back or 500 the actual moderation action.
    try {
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, target.id);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        banned
          ? `🚫 Ваш аккаунт заблокирован администрацией Shalter.\nПричина: ${reason}`
          : "✅ Блокировка вашего аккаунта снята. Приносим извинения за неудобства."
      );
    } catch (err) {
      console.error("ban notification failed:", err);
    }

    res.json({ user: { ...userLabel(updated), bannedAt: updated.bannedAt || null, banReason: updated.banReason || null } });
  })
);

// Sets (or clears, with an empty/absent label) the public safety marker.
// Separate from banning on purpose: a marked-but-active account is the useful
// middle state — a suspected scammer people are warned about while the
// evidence is still being reviewed, rather than a binary "untouched or gone".
router.post(
  "/users/:id/label",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const raw = req.body?.label;
    const label = raw ? String(raw) : "";
    if (label && !SAFETY_LABELS.has(label)) return res.status(400).json({ error: "Неизвестная метка" });

    const updated = await setSafetyLabel(target.id, label);
    res.json({ user: { ...userLabel(updated), safetyLabelAt: updated.safetyLabelAt || null } });
  })
);

// The verified check. Deliberately covers accounts, bots, channels and groups
// through one pair of routes: a fake "official" channel misleads exactly the
// way a fake official account does, and having two half-features would mean one
// of them quietly not existing.
//
// It is a claim by the administration, nothing more — it says "we checked who
// runs this", not "this is safe". Which is why it sits next to the safety label
// rather than replacing it.
router.post(
  "/users/:id/verify",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    const verified = !!req.body?.verified;
    const updated = await setVerified(target.id, verified);

    // Told to the account, like every other administrative action here — a mark
    // appearing on your profile without explanation is unsettling either way.
    try {
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, target.id);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        verified
          ? "✅ Ваш аккаунт верифицирован — рядом с именем появилась галочка."
          : "Отметка о верификации с вашего аккаунта снята."
      );
    } catch (err) {
      console.error("verify notice failed:", err);
    }

    res.json({ user: { ...userLabel(updated), isVerified: !!updated.isVerified } });
  })
);

router.post(
  "/chats/:id/verify",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const chat = await getChat(req.params.id);
    if (!chat) return res.status(404).json({ error: "Чат не найден" });
    if (chat.type === "dm") return res.status(400).json({ error: "Верифицировать можно группы, каналы и аккаунты" });
    const updated = await updateChat(chat.id, { isVerified: !!req.body?.verified });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

// Deleting somebody else's account. The developer's last resort — for the
// accounts a ban isn't the right answer to: a bot farm, a duplicate, an account
// created by mistake, or one whose owner asked for it to be removed and can no
// longer sign in to do it themselves.
//
// It runs the same cascade as a person deleting their own account
// (lib/deleteAccount.js): profile, messages, one-to-one chats, membership
// everywhere else. Irreversible, so it asks for the account's @handle to be
// typed back — an id in a URL is far too easy to be the wrong one — and it is
// written into the export journal, because "the administration deleted an
// account" is exactly the kind of act that should leave a trace.
router.delete(
  "/users/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (target.id === req.uid) {
      return res.status(400).json({ error: "Свой аккаунт удаляется в настройках — там же, где у всех" });
    }
    if (target.isBot && target.id.startsWith("bot_")) {
      return res.status(400).json({ error: "Служебные аккаунты Shalter удалять нельзя" });
    }

    // Typed confirmation, checked server-side rather than trusted from a dialog:
    // this route is reachable without the dialog.
    const confirm = String(req.body?.confirm ?? "").trim().replace(/^@/, "").toLowerCase();
    const handle = (target.username || target.id).toLowerCase();
    if (confirm !== handle) {
      return res.status(400).json({ error: `Для подтверждения введите @${target.username || target.id}` });
    }

    const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "Укажите основание — оно попадёт в журнал" });

    // Logged before the deletion, while the account still exists to be named.
    await logExport({
      adminId: req.uid,
      targetUserId: target.id,
      reason: `УДАЛЕНИЕ АККАУНТА @${target.username || target.id} (${target.name}): ${reason}`,
      messageCount: 0,
    });

    await deleteAccount(target.id);
    res.json({ ok: true, deleted: { id: target.id, name: target.name, username: target.username } });
  })
);

// Resetting somebody else's password. The last door into an account when every
// other one is shut: no e-mail attached, no device still signed in, nothing to
// receive a code on. That situation is not hypothetical — it is what happens to
// the very first account on a fresh deployment.
//
// The power is real (this is account takeover by definition), so it carries the
// same discipline as deletion above: the handle typed back, a mandatory reason,
// a journal entry written before anything changes, and the owner told in their
// own chat afterwards. Every session is signed out, so a reset cannot be used
// to quietly ride along beside the owner.
router.post(
  "/users/:id/reset-password",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (target.isBot) return res.status(400).json({ error: "У ботов нет пароля — им управляет владелец через токен" });

    const confirm = String(req.body?.confirm ?? "").trim().replace(/^@/, "").toLowerCase();
    const handle = (target.username || target.id).toLowerCase();
    if (confirm !== handle) {
      return res.status(400).json({ error: `Для подтверждения введите @${target.username || target.id}` });
    }

    const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "Укажите основание — оно попадёт в журнал" });

    const password = String(req.body?.password ?? "");
    if (password.length < 6) return res.status(400).json({ error: "Пароль — не короче 6 символов" });

    // Two-factor authentication is *not* lifted by default: it exists precisely
    // so that knowing the password isn't enough, and an administrator quietly
    // stripping it would make it worthless. Lifting it is a separate, explicit
    // choice, recorded separately in the journal.
    const liftTwoFactor = req.body?.disableTwoFactor === true && target.twoFactorEnabled;

    await logExport({
      adminId: req.uid,
      targetUserId: target.id,
      reason: `СБРОС ПАРОЛЯ @${target.username || target.id} (${target.name})${liftTwoFactor ? " + СНЯТА 2FA" : ""}: ${reason}`,
      messageCount: 0,
    });

    const { hash, salt } = hashPassword(password);
    await updateUser(target.id, { passwordHash: hash, passwordSalt: salt });
    if (liftTwoFactor) await disableTotp(target.id);
    await revokeAllSessions(target.id);

    try {
      const chat = await findOrCreateDm(target.id, SYSTEM_BOT_ID);
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        `🔐 Администрация Shalter сбросила пароль вашего аккаунта.\nОснование: ${reason}\n\nВсе сеансы завершены.${liftTwoFactor ? "\nДвухфакторная аутентификация снята — включите её заново: Настройки → Конфиденциальность." : ""}\n\nЕсли вы этого не просили — немедленно смените пароль в настройках.`
      );
    } catch (err) {
      console.error("password reset notice failed:", err);
    }

    res.json({ ok: true, twoFactorLifted: liftTwoFactor });
  })
);

// Состояние отправки почты — «а работает ли вообще SMTP» без доступа к серверу.
//
// Обычно это выясняют командой в консоли (scripts/mail-test.js) и чтением
// логов. Развёртывание, куда попадают только пушем, такой возможности не даёт:
// человек видит «письмо не доставлено» и не может узнать, дело в пароле, в
// закрытом порте или в самом адресе. Поэтому ответ сервера показывается здесь —
// администратору, который и так видит куда более чувствительные вещи.
router.get(
  "/mail-status",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const [check, dnsAdvice] = await Promise.all([verifySmtp(), buildDnsAdvice()]);
    res.json({
      from: process.env.MAIL_FROM || "Shalter <no-reply@shalter.ru>",
      configured: check.configured === true,
      ok: check.ok === true,
      error: check.error ?? null,
      // Без SMTP письмо отдаётся почтовому серверу получателя напрямую. Тогда
      // за отправителя ручаются не чужой провайдер, а записи в DNS самого
      // домена — их и показываем ниже (lib/mailDns.js).
      directEnabled: process.env.MAIL_DIRECT !== "0",
      dns: dnsAdvice,
    });
  })
);

module.exports = router;
