const db = require("../db");
const { rowToMessage, readWatermarksFor } = require("./messages");
const { getUser } = require("./users");
const { publicUser } = require("./sanitize");
const { getSettings } = require("./settings");

// Сводка для списка чатов: последнее сообщение, число непрочитанных, упоминания
// и собеседник.
//
// Раньше это делалось так: прочитать **все** сообщения базы и всех
// пользователей в память, а потом отфильтровать в JS по каждому чату. На живом
// аккаунте это ровно то, отчего «мессенджер долго грузится»: замерено — 60 000
// сообщений давали 154 мс на один запрос, а список чатов запрашивается
// постоянно. Стоимость росла со всей историей мессенджера, хотя нужно от силы
// тридцать строк.
//
// Теперь считает база: два запроса с группировкой по чату вместо полного
// перебора, и пользователи подтягиваются только те, что реально нужны.

// Поиск идентификатора внутри JSON-массива строк. Полноценного JSON-оператора у
// нас нет (столбцы — обычный TEXT), но идентификаторы уникальны и всегда
// заключены в кавычки, поэтому подстрока `"u_123"` не может совпасть случайно.
function jsonHas(id) {
  return `%"${id}"%`;
}

async function attachSummaries(chats, userId) {
  if (!chats.length) return [];
  const settings = await getSettings(userId);
  const chatClears = settings.chatClears ?? {};
  const drafts = settings.drafts ?? {};
  const ids = chats.map((c) => c.id);

  // Последние сообщения — по маленькому запросу на чат.
  //
  // Соблазн сделать это одним запросом с оконной функцией велик и обманчив:
  // замерено, ROW_NUMBER() OVER (PARTITION BY chatId) по тем же данным стоит
  // 96 мс против 1.4 мс у тридцати запросов с LIMIT 5. Окно вынуждает базу
  // перебрать все сообщения этих чатов; LIMIT по индексу (chatId, createdAt)
  // читает ровно пять строк с конца.
  //
  // Пять, а не одна: самое свежее сообщение может быть удалено лично этим
  // человеком или отсечено очисткой истории — тогда показать надо следующее.
  const lastOfChat = db.prepare(
    `SELECT * FROM messages
      WHERE chatId = ? AND threadRootId IS NULL AND deletedForIds NOT LIKE ?
      ORDER BY createdAt DESC, rowid DESC LIMIT 5`
  );
  const lastByChat = new Map(ids.map((id) => [id, lastOfChat.all(id, jsonHas(userId))]));

  // Непрочитанные и упоминания.
  //
  // Считаются только по сообщениям новее отметки прочтения (data/messages.js,
  // chat_reads): всё, что старше, прочитано по определению — отметка ставится
  // ровно в тот момент, когда чат прочитан целиком. Без неё приходилось
  // проверять `readByIds NOT LIKE` у каждого сообщения чата, а это перебор всей
  // переписки на каждое обновление списка.
  //
  // Отметки может не быть (чат ни разу не открывали, или база из прошлой
  // версии) — тогда границей служит пустая строка, и запрос честно проходит по
  // всему чату, как раньше.
  const watermarks = readWatermarksFor(userId);
  const unreadOfChat = db.prepare(
    `SELECT COUNT(*) AS unread, SUM(CASE WHEN mentionedUserIds LIKE ? THEN 1 ELSE 0 END) AS mentions
       FROM messages
      WHERE chatId = ? AND threadRootId IS NULL AND senderId <> ?
        AND createdAt > ?
        AND readByIds NOT LIKE ? AND deletedForIds NOT LIKE ?`
  );

  // Собеседники — только те, что нужны этому списку, а не все пользователи базы.
  const peerIds = new Set();
  for (const chat of chats) {
    if (chat.type === "dm" || chat.type === "bot") {
      const other = chat.memberIds.find((id) => id !== userId);
      if (other) peerIds.add(other);
    }
  }
  const peers = new Map();
  for (const id of peerIds) {
    const user = await getUser(id);
    if (user) peers.set(id, publicUser(user));
  }

  return chats.map((chat) => {
    const clearedBefore = chatClears[chat.id];
    const candidates = (lastByChat.get(chat.id) ?? []).filter((r) => !clearedBefore || r.createdAt > clearedBefore);
    const lastMessage = candidates.length ? rowToMessage(candidates[0]) : null;

    // Граница — позднейшая из двух: до чего дочитали и до чего очистили.
    const since = [watermarks.get(chat.id) ?? "", clearedBefore ?? ""].sort().pop();
    const row = unreadOfChat.get(jsonHas(userId), chat.id, userId, since, jsonHas(userId), jsonHas(userId));
    const unreadCount = row?.unread ?? 0;
    const hasUnreadMention = (row?.mentions ?? 0) > 0;

    const otherUserId = (chat.type === "dm" || chat.type === "bot") && chat.memberIds.find((id) => id !== userId);
    const otherUser = otherUserId ? peers.get(otherUserId) ?? null : null;

    // Чат с самим собой — «Избранное». Другого участника у него нет, и без
    // этого он выглядел бы дубликатом самого человека.
    const isSaved = chat.type === "dm" && chat.memberIds.length === 1 && chat.memberIds[0] === userId;

    return {
      ...chat,
      title: isSaved ? "Избранное" : chat.title,
      isSaved: isSaved || undefined,
      lastMessage,
      unreadCount,
      hasUnreadMention,
      otherUser: isSaved ? null : otherUser,
      draft: drafts[chat.id] ?? null,
    };
  });
}

module.exports = { attachSummaries };
