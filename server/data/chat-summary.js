const db = require("../db");
const { rowToMessage, readWatermarksFor } = require("./messages");
const { getUser } = require("./users");
const { publicUser } = require("./sanitize");
const { getSettings, updateSettings, mutedStateFor, isQuietNow } = require("./settings");

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
  // Беззвучность у каждого своя (data/settings.js) — накладываем её поверх
  // записи чата, где раньше лежал один флаг на всех.
  const mutedOf = (id) => mutedStateFor(settings, id);
  const chatClears = settings.chatClears ?? {};
  const drafts = settings.drafts ?? {};
  const chatFlags = settings.chatFlags ?? {};
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

  const pinnedOrder = settings.pinnedOrder ?? [];
  // Чаты, которые пора вернуть из архива (см. ниже) — записываются одним
  // обновлением настроек после сборки списка, а не по записи на чат.
  const unarchive = [];

  const result = chats.map((chat) => {
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

    // Архив как в Telegram: незаглушённый чат возвращается в общий список,
    // как только в нём появляется новое сообщение от кого-то другого. Отсчёт —
    // от момента архивации (chatFlags[id].archivedAt, PATCH /api/chats/:id);
    // у чатов, убранных в архив до этой правки, отметки нет, и они остаются на
    // месте. Заглушённые не возвращаются — ради них архив обычно и заводят.
    const flags = chatFlags[chat.id];
    let archived = typeof flags?.archived === "boolean" ? flags.archived : !!chat.archived;
    if (
      archived &&
      flags?.archivedAt &&
      lastMessage &&
      lastMessage.senderId !== userId &&
      lastMessage.type !== "system" &&
      lastMessage.createdAt > flags.archivedAt &&
      !isQuietNow(settings, chat.id) &&
      !(typeof flags.muted === "boolean" ? flags.muted : chat.muted)
    ) {
      archived = false;
      unarchive.push(chat.id);
    }
    const pinIdx = pinnedOrder.indexOf(chat.id);

    return {
      ...chat,
      // Беззвучность — из настроек читающего. Прежний общий флаг в записи чата
      // остаётся запасным значением, чтобы у тех, кто заглушил чат до этой
      // правки, он не «зазвучал» вдруг снова.
      ...(mutedStateFor(settings, chat.id).muted || mutedStateFor(settings, chat.id).mutedUntil || typeof chatFlags[chat.id]?.muted === "boolean"
        ? mutedStateFor(settings, chat.id)
        : { muted: !!chat.muted, mutedUntil: chat.mutedUntil ?? null }),
      // Закреп и архив — тоже у каждого свои (settings.chatFlags, см.
      // PATCH /api/chats/:id). Раньше это были столбцы общей записи чата, и
      // стоило собеседнику убрать личный чат в архив, как он пропадал из
      // списка и у второго. Общий флаг остаётся запасным значением для тех,
      // кто ещё ни разу не трогал этот чат после правки.
      pinned: typeof chatFlags[chat.id]?.pinned === "boolean" ? chatFlags[chat.id].pinned : !!chat.pinned,
      archived,
      // Место среди закреплённых (0 — самый верхний); null — порядок не задан,
      // такие идут после упорядоченных, по свежести.
      pinOrder: pinIdx >= 0 ? pinIdx : null,
      title: isSaved ? "Избранное" : chat.title,
      isSaved: isSaved || undefined,
      lastMessage,
      unreadCount,
      hasUnreadMention,
      otherUser: isSaved ? null : otherUser,
      draft: drafts[chat.id] ?? null,
    };
  });

  if (unarchive.length) {
    // Перечитываем настройки перед записью: между чтением выше и этой строкой
    // человек мог успеть что-то поменять, и писать старый снимок поверх нельзя.
    const fresh = await getSettings(userId);
    const nextFlags = { ...(fresh.chatFlags ?? {}) };
    for (const id of unarchive) {
      const { archivedAt, ...rest } = nextFlags[id] ?? {};
      nextFlags[id] = { ...rest, archived: false };
    }
    await updateSettings(userId, { chatFlags: nextFlags });
  }
  return result;
}

module.exports = { attachSummaries };
