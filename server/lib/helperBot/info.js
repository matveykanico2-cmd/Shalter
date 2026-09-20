const { getUser } = require("../../data/users");
const { getChat, updateChat } = require("../../data/chats");
const { setChatCleared } = require("../../data/settings");
const { addReport } = require("../../data/reports");
const { isStaff, resolveTarget, formatUserRef } = require("./shared");
const { helpText } = require("./registry");
const { clearPending } = require("./pendingState");

const commands = {
  async start() {
    return "👋 Привет! Я — Помощник: отвечаю на слэш-команды прямо в чате.\n\n/help — полный список того, что умею.";
  },

  async help() {
    return `📋 Команды:\n\n${helpText()}`;
  },

  async menu() {
    return "📋 Главное меню — команды сгруппированы по разделам, смотрите /help.";
  },

  async settings() {
    return "⚙️ Настройки приложения открываются в самом Shalter — значок шестерёнки в списке чатов.";
  },

  async profile(ctx) {
    const target = ctx.argv.length || ctx.message.replyToId ? await resolveTarget(ctx) : await getUser(ctx.senderId);
    if (!target) return "Не нашёл такого пользователя.";
    return [
      `👤 ${target.name}${target.username ? ` (@${target.username})` : ""}`,
      target.bio || null,
      `ID: ${target.id}`,
      target.isPremium ? "⭐ Premium" : null,
      `Онлайн: ${target.online ? "да" : "нет"}`,
    ]
      .filter(Boolean)
      .join("\n");
  },

  async lang(ctx) {
    const { getSettings, updateSettings } = require("../../data/settings");
    const code = ctx.argv[0];
    if (!code) {
      const settings = await getSettings(ctx.senderId);
      return `🌐 Текущий язык интерфейса: ${settings.uiLanguage}.\nЧтобы сменить: /lang ru (или любой другой код языка)`;
    }
    await updateSettings(ctx.senderId, { uiLanguage: code.toLowerCase() });
    return `✅ Язык интерфейса изменён на «${code.toLowerCase()}».`;
  },

  async id(ctx) {
    return `🆔 Ваш ID: ${ctx.senderId}\nID этого чата: ${ctx.chatId}`;
  },

  async ping() {
    return "🏓 Понг! Всё работает.";
  },

  async info(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return "Ответьте этой командой на сообщение или укажите @username: /info @username";
    return (
      `👤 ${formatUserRef(target)}\nID: ${target.id}\nОнлайн: ${target.online ? "да" : "нет"}` +
      (target.isBot ? "\n🤖 Это бот" : "")
    );
  },

  async about() {
    return "🤖 Помощник Shalter — встроенный бот с набором слэш-команд для чатов. /help — что умею.";
  },

  async support() {
    return "Опишите проблему в чате с @hugo — это наша поддержка, отвечает мгновенно на частые вопросы и передаёт остальное человеку.";
  },

  async feedback(ctx) {
    if (!ctx.args) return "Напишите отзыв так: /feedback ваш текст";
    await addReport({
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      reporterId: ctx.senderId,
      targetType: "feedback",
      targetId: ctx.chatId,
      subjectUserId: ctx.senderId,
      reason: "feedback",
      details: ctx.args,
      createdAt: new Date().toISOString(),
      status: "open",
    });
    return "Спасибо! Отзыв передан команде.";
  },

  async cancel(ctx) {
    clearPending(ctx.chatId, ctx.senderId);
    return "Отменено.";
  },

  async clear(ctx) {
    await setChatCleared(ctx.senderId, ctx.chatId, new Date().toISOString());
    return "🧹 История этого чата очищена у вас (у остальных участников остаётся без изменений).";
  },

  async rules(ctx) {
    if (ctx.argv[0] === "set") {
      if (!isStaff(ctx.chat, ctx.senderId)) return "Менять правила может только администратор или владелец.";
      const text = ctx.args.replace(/^set\s*/i, "").trim();
      if (!text) return "Использование: /rules set текст правил";
      await updateChat(ctx.chatId, { rules: text });
      return "✅ Правила обновлены.";
    }
    const chat = await getChat(ctx.chatId);
    return chat?.rules ? `📜 Правила чата:\n\n${chat.rules}` : "Правила ещё не заданы. Администратор может задать их: /rules set текст";
  },
};

module.exports = { commands };
