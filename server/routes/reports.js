const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { addReport, getReport, setReportStatus } = require("../data/reports");
const { getUser, findUserByPhone, setBanned } = require("../data/users");
const { getChat, deleteChat } = require("../data/chats");
const { getMessage, deleteMessage, setReportMessageStatus } = require("../data/messages");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");

const router = express.Router();
router.use(requireUserId);

const REASONS = new Set(["spam", "scam", "violence", "illegal", "child_safety", "other"]);
const REASON_LABELS = {
  spam: "Спам",
  scam: "Мошенничество",
  violence: "Насилие или угрозы",
  illegal: "Незаконный контент",
  child_safety: "Угроза безопасности детей",
  other: "Другое",
};

function targetSummary(targetType, target) {
  if (targetType === "user") return `Пользователь: ${target.name}${target.username ? ` (@${target.username})` : ""}`;
  if (targetType === "chat") return `${{ dm: "Чат", group: "Группа", channel: "Канал", secret: "Секретный чат", bot: "Бот-чат" }[target.type] ?? "Чат"}: ${target.title || "(без названия)"}`;
  return `Сообщение: «${(target.text || "[вложение]").slice(0, 200)}»`;
}

// Who actually gets banned for a given report — the user themselves for a
// "user" report, the sender for a "message" report, the owner for a "chat"
// (group/channel) report. A reported DM has no single owner (ownerId is
// null for those), so banning is only offered on report cards where this
// resolves to someone real (see messageBubble.js's ReportMessage).
async function responsibleUserId(targetType, target) {
  if (targetType === "user") return target.id;
  if (targetType === "message") return target.senderId;
  return target.ownerId ?? null;
}

// Every report lands here as a real chat message (see ReportMessage in
// messageBubble.js) — same "no separate admin dashboard, everything flows
// through a chat with the Shalter service bot" shape as login codes/security
// alerts. No moderation queue existed before this; reports were only ever
// recorded, never surfaced to anyone (see the old comment this replaced).
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
    const report = await addReport({
      id: `rp_${Date.now()}`,
      reporterId: req.uid,
      targetType,
      targetId,
      reason,
      details: (details ?? "").trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
      status: "open",
    });

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (admin) {
      const canBan = !!(await responsibleUserId(targetType, target));
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

// Delete/ban/dismiss — admin-only (whoever currently holds ADMIN_PHONE, same
// gate as premium.js's /grant and gifts.js's /deliver). Flips the report's
// own status *and* the notification message's embedded status together so
// the buttons in that chat disappear immediately for everyone viewing it.
router.post(
  "/:id/resolve",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (me.phone !== ADMIN_PHONE) return res.status(403).json({ error: "Недостаточно прав" });

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
        nextStatus = "resolved_deleted"; // already gone — still counts as handled
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
      const userId = target ? await responsibleUserId(report.targetType, target) : null;
      if (!userId) return res.status(400).json({ error: "Не удалось определить, кого блокировать" });
      await setBanned(userId, true);
      nextStatus = "resolved_banned";
    }

    await setReportStatus(report.id, nextStatus);
    if (messageId) await setReportMessageStatus(messageId, nextStatus);
    res.json({ status: nextStatus });
  })
);

module.exports = router;
