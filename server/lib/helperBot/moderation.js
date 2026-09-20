const { updateChat } = require("../../data/chats");
const { getMessage, togglePin, chatMessageStats, topSenders } = require("../../data/messages");
const { listUsersByIds } = require("../../data/users");
const { addReport } = require("../../data/reports");
const { isOwner, isOwnerOrAdmin, isStaff, resolveTarget, formatUserRef, parseDuration } = require("./shared");

const GROUP_ONLY = "Эта команда работает только в группах.";
const NEED_STAFF = "Недостаточно прав — нужны права администратора или владельца.";
const NEED_TARGET = "Ответьте этой командой на сообщение цели или укажите @username.";

function requireGroup(ctx) {
  return ctx.chat.type === "group" ? null : GROUP_ONLY;
}

async function kickTarget(ctx) {
  const target = await resolveTarget(ctx);
  if (!target) return NEED_TARGET;
  if (isOwnerOrAdmin(ctx.chat, target.id)) return "Нельзя исключить владельца или администратора.";
  if (!ctx.chat.memberIds.includes(target.id)) return "Этот пользователь не в чате.";
  await updateChat(ctx.chatId, {
    memberIds: ctx.chat.memberIds.filter((id) => id !== target.id),
    adminIds: ctx.chat.adminIds?.filter((id) => id !== target.id),
    moderatorIds: ctx.chat.moderatorIds?.filter((id) => id !== target.id),
    ownerIds: ctx.chat.ownerIds?.filter((id) => id !== target.id),
  });
  return `👢 ${formatUserRef(target)} исключён из чата.`;
}

const commands = {
  // No persistent ban list in this app — same as the "ban" role in
  // routes/chats.js's /:id/members, banning a group member means removing them.
  async ban(ctx) {
    const err = requireGroup(ctx) || (!isOwnerOrAdmin(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    return kickTarget(ctx);
  },

  async kick(ctx) {
    const err = requireGroup(ctx) || (!isStaff(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    return kickTarget(ctx);
  },

  async mute(ctx) {
    const err = requireGroup(ctx) || (!isOwnerOrAdmin(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    const target = await resolveTarget(ctx);
    if (!target) return NEED_TARGET;
    if (isOwner(ctx.chat, target.id) || (ctx.chat.adminIds ?? []).includes(target.id)) {
      return "Нельзя ограничить владельца или администратора.";
    }
    // Duration is whatever trails the target token — "/mute @ivan 1h" or
    // "/mute 1h" as a reply both work.
    const durationArg = ctx.message.replyToId ? ctx.argv[0] : ctx.argv[1];
    const ms = parseDuration(durationArg);
    const until = ms ? new Date(Date.now() + ms).toISOString() : "forever";
    const restrictions = { ...ctx.chat.restrictions, [target.id]: until };
    await updateChat(ctx.chatId, { restrictions });
    return ms
      ? `🔇 ${formatUserRef(target)} не может писать в течение ${durationArg}.`
      : `🔇 ${formatUserRef(target)} замучен(а) без срока. Снять: /unmute`;
  },

  async unmute(ctx) {
    const err = requireGroup(ctx) || (!isOwnerOrAdmin(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    const target = await resolveTarget(ctx);
    if (!target) return NEED_TARGET;
    const restrictions = { ...ctx.chat.restrictions };
    delete restrictions[target.id];
    await updateChat(ctx.chatId, { restrictions });
    return `🔊 ${formatUserRef(target)} снова может писать.`;
  },

  async warn(ctx) {
    const err = requireGroup(ctx) || (!isStaff(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    const target = await resolveTarget(ctx);
    if (!target) return NEED_TARGET;
    const warnings = { ...ctx.chat.warnings };
    warnings[target.id] = (warnings[target.id] ?? 0) + 1;
    await updateChat(ctx.chatId, { warnings });
    return `⚠️ ${formatUserRef(target)} получил(а) предупреждение (${warnings[target.id]}).`;
  },

  async unwarn(ctx) {
    const err = requireGroup(ctx) || (!isStaff(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    const target = await resolveTarget(ctx);
    if (!target) return NEED_TARGET;
    const warnings = { ...ctx.chat.warnings };
    const current = warnings[target.id] ?? 0;
    if (current <= 1) delete warnings[target.id];
    else warnings[target.id] = current - 1;
    await updateChat(ctx.chatId, { warnings });
    return `✅ Снято предупреждение с ${formatUserRef(target)} (осталось ${warnings[target.id] ?? 0}).`;
  },

  async pin(ctx) {
    const err = !isStaff(ctx.chat, ctx.senderId) && ctx.chat.type === "group" ? NEED_STAFF : null;
    if (err) return err;
    if (!ctx.message.replyToId) return "Ответьте этой командой на сообщение, которое нужно закрепить.";
    await togglePin(ctx.message.replyToId, true);
    return "📌 Сообщение закреплено.";
  },

  async unpin(ctx) {
    const err = !isStaff(ctx.chat, ctx.senderId) && ctx.chat.type === "group" ? NEED_STAFF : null;
    if (err) return err;
    const targetId = ctx.message.replyToId;
    if (!targetId) return "Ответьте этой командой на закреплённое сообщение, чтобы открепить его.";
    await togglePin(targetId, false);
    return "📌 Сообщение откреплено.";
  },

  async report(ctx) {
    const replied = ctx.message.replyToId ? await getMessage(ctx.message.replyToId) : null;
    await addReport({
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      reporterId: ctx.senderId,
      targetType: replied ? "message" : "chat",
      targetId: replied ? replied.id : ctx.chatId,
      subjectUserId: replied ? replied.senderId : ctx.senderId,
      reason: ctx.args || "не указана",
      details: ctx.args || null,
      createdAt: new Date().toISOString(),
      status: "open",
    });
    return "🚩 Жалоба отправлена администрации.";
  },

  async top(ctx) {
    const err = requireGroup(ctx);
    if (err) return err;
    const rows = topSenders(ctx.chatId, 10);
    if (!rows.length) return "В этом чате пока нет сообщений.";
    const users = await listUsersByIds(rows.map((r) => r.senderId));
    const byId = new Map(users.map((u) => [u.id, u]));
    const lines = rows.map((r, i) => `${i + 1}. ${formatUserRef(byId.get(r.senderId))} — ${r.c} сообщ.`);
    return `🏆 Топ активных:\n\n${lines.join("\n")}`;
  },

  async stats(ctx) {
    const err = requireGroup(ctx);
    if (err) return err;
    const { total, media } = chatMessageStats(ctx.chatId);
    return `📊 Статистика чата:\nУчастников: ${ctx.chat.memberIds.length}\nСообщений: ${total}\nС вложениями: ${media}`;
  },

  async admin(ctx) {
    const err = requireGroup(ctx) || (!isStaff(ctx.chat, ctx.senderId) && NEED_STAFF);
    if (err) return err;
    const warnCount = Object.keys(ctx.chat.warnings ?? {}).length;
    const mutedCount = Object.keys(ctx.chat.restrictions ?? {}).length;
    return (
      "🛠 Управление группой:\n\n" +
      `Владельцы: ${ctx.chat.ownerIds?.length ?? 0}, администраторы: ${ctx.chat.adminIds?.length ?? 0}, модераторы: ${ctx.chat.moderatorIds?.length ?? 0}\n` +
      `Участников с предупреждениями: ${warnCount}\nЗамьюченных: ${mutedCount}\n\n` +
      "Команды: /ban /kick /mute /unmute /warn /unwarn /pin /unpin /rules set — все как ответ на сообщение участника."
    );
  },
};

module.exports = { commands };
