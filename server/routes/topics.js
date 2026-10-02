// Темы в группах: /api/chats/:id/topics. Включает их владелец или админ;
// создавать темы могут участники, если это не запрещено правом createTopics.
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat, updateChat } = require("../data/chats");
const topics = require("../data/topics");
const { can, isStaff, DENIED } = require("../lib/chatPermissions");
const { logAdminAction } = require("../data/adminLog");
const { broadcastToUsers } = require("../ws");
const { serviceLine } = require("../lib/systemChat");

const router = express.Router({ mergeParams: true });

const MAX_TITLE = 64;

async function memberGroup(req, res) {
  const chat = await getChat(req.params.id);
  if (!chat || !chat.memberIds.includes(req.uid)) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  if (chat.type !== "group") {
    res.status(400).json({ error: "Темы есть только в группах" });
    return null;
  }
  return chat;
}

function isAdmin(chat, uid) {
  return chat.ownerId === uid || (chat.ownerIds ?? []).includes(uid) || (chat.adminIds ?? []).includes(uid);
}

function cleanIcon(value) {
  const icon = String(value ?? "").trim();
  // Один эмодзи (с модификаторами) — не больше 16 code units.
  return icon && icon.length <= 16 && !/[\w<>]/.test(icon) ? icon : null;
}

function notify(chat) {
  broadcastToUsers(chat.memberIds, { type: "topics:updated", chatId: chat.id });
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await memberGroup(req, res);
    if (!chat) return;
    res.json({ enabled: !!chat.topicsEnabled, topics: chat.topicsEnabled ? topics.listTopics(chat.id) : [] });
  })
);

router.post(
  "/enabled",
  asyncRoute(async (req, res) => {
    const chat = await memberGroup(req, res);
    if (!chat) return;
    if (!isAdmin(chat, req.uid)) return res.status(403).json({ error: "Включать темы может только администратор" });
    const enabled = !!req.body?.enabled;
    const updated = await updateChat(chat.id, { topicsEnabled: enabled });
    logAdminAction(chat.id, req.uid, enabled ? "topics_on" : "topics_off");
    if (enabled !== !!chat.topicsEnabled) await serviceLine(updated, req.uid, (name) => `${name} ${enabled ? "включил(а)" : "выключил(а)"} темы в группе`);
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    notify(updated);
    res.json({ chat: updated, enabled, topics: enabled ? topics.listTopics(chat.id) : [] });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await memberGroup(req, res);
    if (!chat) return;
    if (!chat.topicsEnabled) return res.status(400).json({ error: "В этой группе темы выключены" });
    if (!can(chat, req.uid, "createTopics")) return res.status(403).json({ error: DENIED.createTopics });
    const title = String(req.body?.title ?? "").trim().slice(0, MAX_TITLE);
    if (!title) return res.status(400).json({ error: "Введите название темы" });
    if (topics.countTopics(chat.id) >= topics.MAX_TOPICS) {
      return res.status(400).json({ error: `Не больше ${topics.MAX_TOPICS} тем в группе` });
    }
    const topic = topics.createTopic(chat.id, { title, icon: cleanIcon(req.body?.icon), color: req.body?.color }, req.uid);
    logAdminAction(chat.id, req.uid, "topic_create", { details: { title } });
    await serviceLine(chat, req.uid, (name) => `${name} создал(а) тему «${title}»`);
    notify(chat);
    res.json({ topic });
  })
);

router.patch(
  "/:topicId",
  asyncRoute(async (req, res) => {
    const chat = await memberGroup(req, res);
    if (!chat) return;
    const topic = topics.getTopic(req.params.topicId);
    if (!topic || topic.chatId !== chat.id) return res.status(404).json({ error: "Тема не найдена" });
    // Свою тему автор может переименовать; закрывать и править чужие — только админы.
    const staff = isStaff(chat, req.uid);
    if (!staff && topic.createdBy !== req.uid) return res.status(403).json({ error: "Недостаточно прав" });
    if (!staff && req.body?.closed !== undefined) return res.status(403).json({ error: "Закрывать темы могут только администраторы" });

    const patch = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim().slice(0, MAX_TITLE);
      if (!title) return res.status(400).json({ error: "Введите название темы" });
      patch.title = title;
    }
    if (req.body?.icon !== undefined) patch.icon = cleanIcon(req.body.icon);
    if (req.body?.color !== undefined) patch.color = req.body.color;
    if (req.body?.closed !== undefined) patch.closed = !!req.body.closed;
    const updated = topics.updateTopic(topic.id, patch);
    if (patch.closed !== undefined && patch.closed !== topic.closed) {
      await serviceLine(chat, req.uid, (name) => `${name} ${patch.closed ? "закрыл(а)" : "открыл(а)"} тему «${updated.title}»`);
    }
    if (patch.title && patch.title !== topic.title) await serviceLine(chat, req.uid, (name) => `${name} переименовал(а) тему «${topic.title}» в «${updated.title}»`);
    if (patch.closed !== undefined) logAdminAction(chat.id, req.uid, patch.closed ? "topic_close" : "topic_open", { details: { title: updated.title } });
    else logAdminAction(chat.id, req.uid, "topic_edit", { details: { title: updated.title } });
    notify(chat);
    res.json({ topic: updated });
  })
);

router.delete(
  "/:topicId",
  asyncRoute(async (req, res) => {
    const chat = await memberGroup(req, res);
    if (!chat) return;
    const topic = topics.getTopic(req.params.topicId);
    if (!topic || topic.chatId !== chat.id) return res.status(404).json({ error: "Тема не найдена" });
    if (!isAdmin(chat, req.uid)) return res.status(403).json({ error: "Удалять темы может только администратор" });
    const removedIds = topics.deleteTopic(topic.id);
    logAdminAction(chat.id, req.uid, "topic_delete", { details: { title: topic.title } });
    await serviceLine(chat, req.uid, (name) => `${name} удалил(а) тему «${topic.title}»`);
    for (const id of removedIds) broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id });
    notify(chat);
    res.json({ ok: true });
  })
);

module.exports = router;
