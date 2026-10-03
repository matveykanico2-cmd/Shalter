const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { ADMIN_SECTIONS, hasAdminSection, isPrimaryAdmin } = require("../lib/adminAccess");
const {
  getUser,
  findUserByPhone,
  findUserByUsername,
  findUserByEmail,
  setBanned,
  setSafetyLabel,
  setVerified,
  listBannedUsers,
  listLabeledUsers,
  updateUser,
  disableTotp,
  setAdminSections,
  listUsers,
  deleteUser,
} = require("../data/users");
const { getBotByUserId, deleteBot, listBotDmChatIds } = require("../data/bots");
const { hashPassword } = require("../security");
const { revokeAllSessions } = require("../data/sessions");
const { verifySmtp } = require("../lib/mailer");
const { buildDnsAdvice } = require("../lib/mailDns");
const { buildUserExport, logExport, listExports } = require("../data/dataExport");
const { deleteAccount } = require("../lib/deleteAccount");
const { listOpenReports, listReportsAboutUser } = require("../data/reports");
const { getMessage } = require("../data/messages");
const { getChat, updateChat, findChatByUsername, findChatByInviteCode, listChats } = require("../data/chats");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { collectServerStats } = require("../lib/serverStats");
const pricingData = require("../data/pricing");

const router = express.Router();
router.use(requireUserId);

async function requireAdminSection(req, res, section) {
  const me = await getUser(req.uid);
  if (!me || !hasAdminSection(me, section)) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return me;
}

// Модератор не может банить, удалять и сбрасывать пароль тем, кто выше или
// наравне: иначе выданный раздел «moderation» превращался в захват главного
// админа (сброс пароля + снятие 2FA).
async function outranks(adminId, target) {
  const me = await getUser(adminId);
  if (isPrimaryAdmin(me?.phone)) return !isPrimaryAdmin(target.phone);
  if (isAdminPhone(target.phone)) return false;
  if ((target.adminSections ?? []).length) return isAdminPhone(me?.phone);
  return true;
}

function rankError(res) {
  res.status(403).json({ error: "Нельзя применять это к администратору вашего уровня или выше" });
}

async function resolveTarget(query) {
  const q = (query ?? "").trim();
  if (!q) return null;
  return (await getUser(q)) || (await findUserByUsername(q.replace(/^@/, ""))) || (await findUserByPhone(q)) || (await findUserByEmail(q)) || null;
}

router.get(
  "/lookup",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "legal"))) return;
    const target = await resolveTarget(req.query.q);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    res.json({ user: { id: target.id, name: target.name, username: target.username || null, phone: target.phone || null, email: target.email || null } });
  })
);

router.get(
  "/chats/lookup",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const raw = String(req.query.q ?? "").trim();
    const tail = raw.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
    const handle = tail.replace(/^@/, "");
    const chat =
      (await getChat(tail)) || (await findChatByUsername(handle)) || (await findChatByInviteCode(tail)) || null;
    if (!chat || chat.type === "dm" || chat.type === "bot") {
      // Боты — это аккаунты: ищем по @username или id.
      const botUser = (await findUserByUsername(handle)) || (await getUser(tail));
      const bot = botUser?.isBot ? await getBotByUserId(botUser.id) : null;
      if (bot) {
        const owner = bot.ownerId ? await getUser(bot.ownerId) : null;
        return res.json({
          chat: {
            id: botUser.id,
            type: "bot",
            title: botUser.name,
            username: botUser.username || null,
            members: listBotDmChatIds(botUser.id).length,
            owner: owner ? { id: owner.id, name: owner.name, username: owner.username || null } : null,
          },
        });
      }
      return res.status(404).json({ error: "Группа, канал или бот не найдены" });
    }
    const owner = chat.ownerId ? await getUser(chat.ownerId) : null;
    res.json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title ?? chat.name ?? "",
        username: chat.username ?? null,
        members: chat.memberIds.length,
        owner: owner ? { id: owner.id, name: owner.name, username: owner.username || null } : null,
      },
    });
  })
);

router.post(
  "/export",
  asyncRoute(async (req, res) => {
    const admin = await requireAdminSection(req, res, "legal");
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

router.get(
  "/exports",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "legal"))) return;
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

const labelsData = require("../data/safetyLabels");
const statusCatalogData = require("../data/profileStatuses");

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
    phone: u.phone || null,
    email: u.email || null,
    safetyLabel: u.safetyLabel || null,
    isBanned: !!u.isBanned,
    isPremium: !!u.isPremium,
    premiumUntil: u.premiumUntil || null,
    premiumForever: !!u.premiumForever,
    isAdsActive: !!u.isAdsActive,
    adsUntil: u.adsUntil || null,
    adsForever: !!u.adsForever,
    adminSections: u.adminSections ?? [],
    isDeveloper: isAdminPhone(u.phone) || undefined,
  };
}

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
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const [banned, labeled] = await Promise.all([listBannedUsers(), listLabeledUsers()]);
    const openReports = await Promise.all(listOpenReports().map(decorateReport));
    res.json({
      openReports,
      banned: banned.map((u) => ({ ...userLabel(u), bannedAt: u.bannedAt || null, banReason: u.banReason || null })),
      labeled: labeled.map((u) => ({ ...userLabel(u), safetyLabelAt: u.safetyLabelAt || null })),
      labels: labelsData.listLabels(),
      statusCatalog: statusCatalogData.listCatalog(),
    });
  })
);

router.get(
  "/users/:id/reports",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    const reports = await Promise.all(listReportsAboutUser(target.id).map(decorateReport));
    res.json({
      user: { ...userLabel(target), bannedAt: target.bannedAt || null, banReason: target.banReason || null },
      reports,
    });
  })
);

router.post(
  "/users/:id/ban",
  asyncRoute(async (req, res) => {
    const admin = await requireAdminSection(req, res, "moderation");
    if (!admin) return;

    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (target.id === admin.id) return res.status(400).json({ error: "Нельзя заблокировать самого себя" });
    if (!(await outranks(admin.id, target))) return rankError(res);

    const banned = req.body?.banned !== false;
    const reason = (req.body?.reason ?? "").trim();
    if (banned && !reason) return res.status(400).json({ error: "Укажите причину блокировки — её увидит пользователь" });

    const updated = await setBanned(target.id, banned, reason);

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

router.post(
  "/users/:id/label",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const raw = req.body?.label;
    const label = raw ? String(raw) : "";
    if (label && !labelsData.getLabel(label)) return res.status(400).json({ error: "Неизвестная метка" });

    const updated = await setSafetyLabel(target.id, label);
    res.json({ user: { ...userLabel(updated), safetyLabelAt: updated.safetyLabelAt || null } });
  })
);

router.post(
  "/users/:id/verify",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    const verified = !!req.body?.verified;
    const updated = await setVerified(target.id, verified);

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

// Удаление бота за нарушение: бот и его аккаунт, владельцу — уведомление с причиной.
router.delete(
  "/bots/:userId",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const botUser = await getUser(req.params.userId);
    const bot = botUser?.isBot ? await getBotByUserId(botUser.id) : null;
    if (!bot) return res.status(404).json({ error: "Бот не найден" });
    if (botUser.id.startsWith("bot_")) return res.status(400).json({ error: "Служебных ботов Shalter удалять нельзя" });
    const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "Укажите причину — она попадёт в журнал и придёт владельцу" });

    await logExport({
      adminId: req.uid,
      targetUserId: bot.ownerId ?? botUser.id,
      reason: `УДАЛЕНИЕ БОТА ${botUser.username ? `@${botUser.username}` : botUser.id} (${botUser.name}): ${reason}`,
      messageCount: 0,
    });
    const chatIds = listBotDmChatIds(botUser.id);
    await deleteBot(bot.id);
    await deleteUser(botUser.id);
    for (const chatId of chatIds) {
      const chat = await getChat(chatId);
      if (chat) broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: { id: chat.id } });
    }
    if (bot.ownerId) {
      const dm = await findOrCreateDm(SYSTEM_BOT_ID, bot.ownerId);
      await sendMessageAndBroadcast(dm, SYSTEM_BOT_ID, `🛡 Бот «${botUser.name}» удалён модерацией Shalter за нарушение правил.\nПричина: ${reason}`);
    }
    res.json({ ok: true });
  })
);

router.post(
  "/chats/:id/verify",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const chat = await getChat(req.params.id);
    if (!chat) return res.status(404).json({ error: "Чат не найден" });
    if (chat.type === "dm") return res.status(400).json({ error: "Верифицировать можно группы, каналы и аккаунты" });
    const updated = await updateChat(chat.id, { isVerified: !!req.body?.verified });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

router.delete(
  "/users/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (target.id === req.uid) {
      return res.status(400).json({ error: "Свой аккаунт удаляется в настройках — там же, где у всех" });
    }
    if (target.isBot && target.id.startsWith("bot_")) {
      return res.status(400).json({ error: "Служебные аккаунты Shalter удалять нельзя" });
    }
    if (!(await outranks(req.uid, target))) return rankError(res);

    const confirm = String(req.body?.confirm ?? "").trim().replace(/^@/, "").toLowerCase();
    const handle = (target.username || target.id).toLowerCase();
    if (confirm !== handle) {
      return res.status(400).json({ error: `Для подтверждения введите @${target.username || target.id}` });
    }

    const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "Укажите основание — оно попадёт в журнал" });

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

router.post(
  "/users/:id/reset-password",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    if (target.isBot) return res.status(400).json({ error: "У ботов нет пароля — им управляет владелец через токен" });
    if (target.id !== req.uid && !(await outranks(req.uid, target))) return rankError(res);

    const confirm = String(req.body?.confirm ?? "").trim().replace(/^@/, "").toLowerCase();
    const handle = (target.username || target.id).toLowerCase();
    if (confirm !== handle) {
      return res.status(400).json({ error: `Для подтверждения введите @${target.username || target.id}` });
    }

    const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: "Укажите основание — оно попадёт в журнал" });

    const password = String(req.body?.password ?? "");
    if (password.length < 6) return res.status(400).json({ error: "Пароль — не короче 6 символов" });

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

router.get(
  "/mail-status",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "server"))) return;
    const [check, dnsAdvice] = await Promise.all([verifySmtp(), buildDnsAdvice()]);
    res.json({
      from: process.env.MAIL_FROM || "Shalter <no-reply@your-domain.example>",
      configured: check.configured === true,
      ok: check.ok === true,
      error: check.error ?? null,
      directEnabled: process.env.MAIL_DIRECT !== "0",
      dns: dnsAdvice,
    });
  })
);

router.get(
  "/labels",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    res.json({ labels: labelsData.listLabels() });
  })
);

router.post(
  "/labels",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const result = labelsData.createLabel(req.body ?? {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ label: result.label });
  })
);

router.patch(
  "/labels/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const result = labelsData.updateLabel(req.params.id, req.body ?? {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ label: result.label });
  })
);

router.delete(
  "/labels/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    labelsData.deleteLabel(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/status-catalog",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const result = statusCatalogData.createCatalogItem(req.body ?? {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ item: result.item });
  })
);

router.delete(
  "/status-catalog/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    statusCatalogData.deleteCatalogItem(req.params.id);
    res.json({ ok: true });
  })
);

router.get(
  "/server",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "server"))) return;
    res.json(await collectServerStats());
  })
);

router.get(
  "/pricing",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "pricing"))) return;
    res.json({ pricing: pricingData.getPricing(), defaults: pricingData.DEFAULTS });
  })
);

router.put(
  "/pricing",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "pricing"))) return;
    const result = pricingData.updatePricing(req.body ?? {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ pricing: result.value });
  })
);

router.delete(
  "/pricing",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "pricing"))) return;
    res.json({ pricing: pricingData.resetPricing() });
  })
);

router.post(
  "/users/:id/admin-sections",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!me || !isPrimaryAdmin(me.phone)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const requested = Array.isArray(req.body?.sections) ? req.body.sections : [];
    const sections = requested.filter((s) => ADMIN_SECTIONS.includes(s));
    const updated = await setAdminSections(target.id, sections);
    res.json({ user: { id: updated.id, adminSections: updated.adminSections } });
  })
);

router.get(
  "/directory",
  asyncRoute(async (req, res) => {
    if (!(await requireAdminSection(req, res, "moderation"))) return;
    const type = ["users", "bots", "groups", "channels"].includes(req.query.type) ? req.query.type : "users";
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const LIMIT = 100;

    if (type === "users" || type === "bots") {
      const wantBot = type === "bots";
      let users = (await listUsers()).filter((u) => !!u.isBot === wantBot);
      if (q) {
        users = users.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            (u.username ?? "").toLowerCase().includes(q) ||
            (u.phone ?? "").includes(q) ||
            (u.email ?? "").toLowerCase().includes(q)
        );
      }
      users.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      const total = users.length;
      const items = users.slice(0, LIMIT).map((u) => ({
        kind: wantBot ? "bot" : "user",
        id: u.id,
        name: u.name,
        username: u.username || null,
        phone: u.phone || null,
        email: u.email || null,
        isBanned: !!u.isBanned,
      }));
      return res.json({ items, total });
    }

    const wanted = type === "channels" ? "channel" : "group";
    let chats = (await listChats()).filter((c) => c.type === wanted);
    if (q) chats = chats.filter((c) => (c.title ?? "").toLowerCase().includes(q) || (c.username ?? "").toLowerCase().includes(q));
    chats.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    const total = chats.length;
    const items = chats.slice(0, LIMIT).map((c) => ({
      kind: wanted,
      id: c.id,
      title: c.title || c.name || "",
      username: c.username || null,
      members: c.memberIds.length,
    }));
    res.json({ items, total });
  })
);

module.exports = router;
