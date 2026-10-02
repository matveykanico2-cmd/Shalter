const express = require("express");
const { genId } = require("../lib/genId");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { addReport, getReport, setReportStatus } = require("../data/reports");
const { getUser, findUserByPhone, setBanned, setSafetyLabel } = require("../data/users");
const { getChat, deleteChat } = require("../data/chats");
const { getMessage, deleteMessage, setReportMessageStatus } = require("../data/messages");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");

const router = express.Router();
router.use(requireUserId);

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
const REASONS = new Set(Object.keys(REASON_LABELS));

const REASON_TO_LABEL = {
  scam: "scam",
  fake: "fake",
  terrorism: "terrorism",
  extremism: "extremism",
  drugs: "drugs",
};

function targetSummary(targetType, target) {
  if (targetType === "user") return `Пользователь: ${target.name}${target.username ? ` (@${target.username})` : ""}`;
  if (targetType === "chat") return `${{ dm: "Чат", group: "Группа", channel: "Канал", bot: "Бот-чат" }[target.type] ?? "Чат"}: ${target.title || "(без названия)"}`;
  return `Сообщение: «${(target.text || "[вложение]").slice(0, 200)}»`;
}

async function responsibleUserId(targetType, target) {
  if (targetType === "user") return target.id;
  if (targetType === "message") return target.senderId;
  return target.ownerId ?? null;
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { targetType, targetId, reason, details } = req.body ?? {};
    if (!["user", "chat", "message"].includes(targetType)) {
      return res.status(400).json({ error: "invalid target type" });
    }
    if (!REASONS.has(reason)) {
      return res.status(400).json({ error: "invalid reason" });
    }

    let target;
    if (targetType === "user") target = await getUser(targetId);
    else if (targetType === "chat") target = await getChat(targetId);
    else {
      target = await getMessage(targetId);
      if (target) {
        const chat = await getChat(target.chatId);
        if (!chat || !chat.memberIds.includes(req.uid)) target = null;
      }
    }
    if (!target) return res.status(404).json({ error: "not found" });
    if (targetType === "user" && targetId === req.uid) {
      return res.status(400).json({ error: "Нельзя пожаловаться на себя" });
    }
    if (targetType === "message" && target.senderId === req.uid) {
      return res.status(400).json({ error: "Нельзя пожаловаться на своё сообщение" });
    }

    const reporter = await getUser(req.uid);
    const subjectUserId = await responsibleUserId(targetType, target);
    const report = await addReport({
      id: genId("rp"),
      reporterId: req.uid,
      targetType,
      targetId,
      subjectUserId,
      reason,
      details: (details ?? "").trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
      status: "open",
    });

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (admin) {
      const canBan = !!subjectUserId;
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, admin.id);
      const summary = targetSummary(targetType, target);
      const details2 = report.details ? `\n«${report.details}»` : "";
      await sendMessageAndBroadcast(
        chat,
        SYSTEM_BOT_ID,
        `🚩 Новая жалоба (${REASON_LABELS[reason]}) от ${reporter.name}\n${summary}${details2}`,
        {
          type: "report",
          report: { reportId: report.id, reason, reporterName: reporter.name, targetType, targetSummary: summary, status: "open", canBan },
        }
      );
    }

    res.json({ report });
  })
);

router.post(
  "/:id/resolve",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me.phone)) return res.status(403).json({ error: "Недостаточно прав" });

    const { action, messageId } = req.body ?? {};
    if (!["delete", "ban", "dismiss"].includes(action)) {
      return res.status(400).json({ error: "invalid action" });
    }
    const report = await getReport(req.params.id);
    if (!report) return res.status(404).json({ error: "Жалоба не найдена" });
    if (report.status !== "open") return res.status(400).json({ error: "Жалоба уже обработана" });

    let target;
    if (report.targetType === "user") target = await getUser(report.targetId);
    else if (report.targetType === "chat") target = await getChat(report.targetId);
    else target = await getMessage(report.targetId);

    let nextStatus = "dismissed";
    if (action === "delete") {
      if (!target) {
        nextStatus = "resolved_deleted";
      } else if (report.targetType === "chat") {
        await deleteChat(report.targetId);
        nextStatus = "resolved_deleted";
      } else if (report.targetType === "message") {
        await deleteMessage(report.targetId);
        nextStatus = "resolved_deleted";
      } else {
        return res.status(400).json({ error: "Пользователя нельзя удалить — только заблокировать" });
      }
    } else if (action === "ban") {
      const userId = report.subjectUserId ?? (target ? await responsibleUserId(report.targetType, target) : null);
      if (!userId) return res.status(400).json({ error: "Не удалось определить, кого блокировать" });
      await setBanned(userId, true, `Жалоба: ${REASON_LABELS[report.reason] ?? report.reason}`);
      const label = REASON_TO_LABEL[report.reason];
      if (label) {
        const banned = await getUser(userId);
        if (banned && !banned.safetyLabel) await setSafetyLabel(userId, label);
      }
      nextStatus = "resolved_banned";
    }

    await setReportStatus(report.id, nextStatus);
    if (messageId) await setReportMessageStatus(messageId, nextStatus);
    res.json({ status: nextStatus });
  })
);

module.exports = router;
