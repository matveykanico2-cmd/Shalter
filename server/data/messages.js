const db = require("../db");
const { encryptText, decryptText, searchQuery, hasLink } = require("../lib/textCrypto");

function rowToMessage(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    type: row.type,
    // В базе текст зашифрован (lib/textCrypto.js) — наружу из этого модуля
    // он выходит уже открытым, остальной код о шифровании не знает.
    text: decryptText(row.id, row.text),
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? undefined,
    pinned: !!row.pinned,
    replyToId: row.replyToId ?? null,
    forwardedFrom: row.forwardedFrom ? JSON.parse(row.forwardedFrom) : undefined,
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    keyboard: row.keyboard ? JSON.parse(row.keyboard) : undefined,
    gift: row.gift ? JSON.parse(row.gift) : undefined,
    sticker: row.sticker ? JSON.parse(row.sticker) : undefined,
    linkPreview: row.linkPreview ? JSON.parse(row.linkPreview) : undefined,
    report: row.report ? JSON.parse(row.report) : undefined,
    reactions: JSON.parse(row.reactions),
    readByIds: JSON.parse(row.readByIds),
    deletedForIds: JSON.parse(row.deletedForIds),
    mentionedUserIds: row.mentionedUserIds ? JSON.parse(row.mentionedUserIds) : [],
    threadRootId: row.threadRootId ?? undefined,
    anchorForPostId: row.anchorForPostId ?? undefined,
    discussionAnchorId: row.discussionAnchorId ?? undefined,
    signedBy: row.signedBy ?? undefined,
    anonymous: !!row.anonymous || undefined,
    boostedUntil: row.boostedUntil ?? undefined,
    // Ноль не отдаём: обычных сообщений подавляющее большинство, и лишнее поле
    // в каждом из них — это лишние байты в каждом ответе.
    paidStars: row.paidStars || undefined,
    boostedById: row.boostedById ?? undefined,
    views: row.views,
    commentCount: row.commentCount || undefined,
  };
}

// Новые сообщения для бота — то, что отдаёт опрос /api/bot-api/updates.
//
// Раньше маршрут читал **всю** таблицу сообщений и фильтровал в памяти: один
// активный бот заставлял сервер перебирать десятки тысяч строк каждую секунду.
// Теперь работу делает индекс (chatId, createdAt) — и делает её за один
// запрос, вместе с проверкой членства.
//
// Единый запрос здесь не ради красоты. Пока это были два шага (сначала список
// чатов бота, потом сообщения по нему), длинный опрос спотыкался ровно на
// самом важном случае: человек пишет боту ВПЕРВЫЕ, диалог создаётся уже во
// время ожидания, и первое в жизни сообщение бот не видел до конца опроса.
// Проверено — висело все 20 секунд и возвращало пусто. Здесь членство берётся
// тем же запросом, что и сообщения, поэтому «сейчас» означает сейчас.
function listNewForBot(botUserId, { after, limit = 200 }) {
  return db
    .prepare(
      `SELECT m.* FROM messages m
         JOIN chat_members cm ON cm.chatId = m.chatId AND cm.userId = ?
        WHERE m.createdAt > ? AND m.senderId <> ?
        ORDER BY m.createdAt ASC LIMIT ?`
    )
    .all(botUserId, after, botUserId, limit)
    .map(rowToMessage);
}

// Поиск по тексту — через поисковый указатель (db.js, messages_search).
// Текст в базе зашифрован, поэтому в указателе лежат не слова, а их
// отпечатки (lib/textCrypto.js); запрос превращается в отпечатки тем же
// ключом, и дальше это обычный поиск FTS5 по указателю, без перебора строк.
//
// Последнее слово ищется как начало слова: человек в строке поиска ещё
// печатает, и «сообщ» должно находить «сообщение», а не молчать до последней
// буквы.
function searchInChats(chatIds, query, { limit = 40 } = {}) {
  if (!chatIds.length || !query) return [];
  const match = searchQuery(query);
  if (!match) return [];
  const ph = chatIds.map(() => "?").join(",");
  try {
    return db
      .prepare(
        `SELECT m.* FROM messages_search f
           JOIN messages m ON m.rowid = f.rowid
          WHERE messages_search MATCH ? AND m.chatId IN (${ph})
          ORDER BY m.createdAt DESC LIMIT ?`
      )
      .all(match, ...chatIds, limit)
      .map(rowToMessage)
      .reverse();
  } catch {
    return [];
  }
}

// Сообщения с вложениями или ссылками — для вкладок «Медиа», «Файлы»,
// «Ссылки» в профиле. Раньше туда читалась вся переписка целиком, а нужны из
// неё единицы: в чате на две тысячи сообщений это две тысячи разобранных
// строк JSON ради десятка картинок.
function listMediaMessages(chatId, viewerId, { limit = 300 } = {}) {
  return db
    .prepare(
      `SELECT * FROM messages
        WHERE chatId = ?
          AND deletedForIds NOT LIKE ?
          AND threadRootId IS NULL
          AND (attachments IS NOT NULL OR linkPreview IS NOT NULL OR hasLink = 1)
        ORDER BY createdAt DESC LIMIT ?`
    )
    .all(chatId, `%"${viewerId}"%`, limit)
    .map(rowToMessage)
    .reverse();
}

function listAllMessages() {
  return db.prepare("SELECT * FROM messages").all().map(rowToMessage);
}

// viewerId + clearedBefore apply the per-viewer overlay: messages the viewer
// deleted "for themselves" (deletedForIds) or that predate their own
// "clear history for me" action (clearedBefore, from Settings.chatClears) are
// hidden from *this* viewer only — everyone else still sees them normally.
async function listMessages(chatId, viewerId, clearedBefore) {
  let rows = db.prepare("SELECT * FROM messages WHERE chatId = ? ORDER BY createdAt ASC").all(chatId).map(rowToMessage);
  if (viewerId) rows = rows.filter((m) => !m.deletedForIds?.includes(viewerId));
  if (clearedBefore) rows = rows.filter((m) => m.createdAt > clearedBefore);
  // Thread replies (threadRootId set) live only in the thread panel
  // (threadPanel.js's GET .../thread/:rootId below) — showing them here too
  // would defeat the point of a thread (keeping the main timeline readable).
  return rows.filter((m) => !m.threadRootId);
}

// One page of history, newest-first in SQL and returned oldest-first so the
// caller can append it straight into a timeline.
//
// This exists because the un-paginated version above returned *every* message
// in the chat on every open and on every 15s poll: measured on a 5000-message
// chat that was a 1.6MB payload and ~130k DOM nodes, and it was rebuilt from
// scratch each poll. LIMIT in SQL rather than slicing in JS, so a long history
// costs the same as a short one.
//
// The per-viewer overlay (deleted-for-me, cleared-history) is applied inside the
// query for the same reason — filtering afterwards would mean reading the whole
// table again just to throw most of it away. `before` is an exclusive cursor on
// createdAt; ids break ties so two messages in the same millisecond can't cause
// a page to repeat or skip one.
function listMessagesPage(chatId, viewerId, clearedBefore, { limit = 60, before = null } = {}) {
  const params = { chatId, limit: limit + 1 }; // one extra row tells us if more exist
  let sql = "SELECT * FROM messages WHERE chatId = @chatId AND threadRootId IS NULL";
  if (clearedBefore) {
    sql += " AND createdAt > @clearedBefore";
    params.clearedBefore = clearedBefore;
  }
  if (before) {
    sql += " AND createdAt < @before";
    params.before = before;
  }
  sql += " ORDER BY createdAt DESC, id DESC LIMIT @limit";

  let rows = db.prepare(sql).all(params).map(rowToMessage);
  // deletedForIds is a JSON column, so this one stays in JS — it can't be
  // indexed anyway, and it only ever runs over a single page now.
  if (viewerId) rows = rows.filter((m) => !m.deletedForIds?.includes(viewerId));

  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  rows.reverse(); // oldest-first, the order a chat is read in
  return { messages: rows, hasMore };
}

// The thread panel's own message list (public/js/components/threadPanel.js)
// — everything replying *into* this root, in the order sent. No
// deletedForIds/clearedBefore overlay here: threads are new enough in this
// app that neither "clear history" nor "delete for me" needs to reach into
// them for a first version.
async function listThreadReplies(rootId) {
  return db.prepare("SELECT * FROM messages WHERE threadRootId = ? ORDER BY createdAt ASC").all(rootId).map(rowToMessage);
}

async function getMessage(id) {
  return rowToMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id));
}

async function addMessage(message) {
  db.prepare(
    `INSERT INTO messages (id, chatId, senderId, type, text, hasLink, createdAt, editedAt, pinned, replyToId, forwardedFrom, attachments, keyboard, gift, sticker, report, reactions, readByIds, deletedForIds, mentionedUserIds, threadRootId, anchorForPostId, discussionAnchorId, signedBy, views, commentCount, paidStars, anonymous)
     VALUES (@id, @chatId, @senderId, @type, @text, @hasLink, @createdAt, @editedAt, @pinned, @replyToId, @forwardedFrom, @attachments, @keyboard, @gift, @sticker, @report, @reactions, @readByIds, @deletedForIds, @mentionedUserIds, @threadRootId, @anchorForPostId, @discussionAnchorId, @signedBy, @views, @commentCount, @paidStars, @anonymous)`
  ).run({
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    paidStars: message.paidStars ?? 0,
    type: message.type ?? "text",
    text: encryptText(message.id, message.text),
    hasLink: hasLink(message.text),
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    pinned: message.pinned ? 1 : 0,
    replyToId: message.replyToId ?? null,
    forwardedFrom: message.forwardedFrom ? JSON.stringify(message.forwardedFrom) : null,
    attachments: message.attachments ? JSON.stringify(message.attachments) : null,
    keyboard: message.keyboard ? JSON.stringify(message.keyboard) : null,
    gift: message.gift ? JSON.stringify(message.gift) : null,
    sticker: message.sticker ? JSON.stringify(message.sticker) : null,
    report: message.report ? JSON.stringify(message.report) : null,
    reactions: JSON.stringify(message.reactions ?? []),
    readByIds: JSON.stringify(message.readByIds ?? []),
    deletedForIds: JSON.stringify(message.deletedForIds ?? []),
    mentionedUserIds: JSON.stringify(message.mentionedUserIds ?? []),
    threadRootId: message.threadRootId ?? null,
    anchorForPostId: message.anchorForPostId ?? null,
    discussionAnchorId: message.discussionAnchorId ?? null,
    signedBy: message.signedBy ?? null,
    views: message.views ?? 0,
    commentCount: message.commentCount ?? 0,
    anonymous: message.anonymous ? 1 : 0,
  });
  return getMessage(message.id);
}

async function deleteMessagesForChat(chatId) {
  db.prepare("DELETE FROM messages WHERE chatId = ?").run(chatId);
}

// Auto-delete sweep (server/lib/autoDelete.js) — finds and deletes everything
// past its expiry in one query/transaction rather than select-then-delete-
// one-by-one, and hands back the ids so the caller can broadcast exactly
// what disappeared.
function deleteExpiredMessages(chatId, cutoffIso) {
  const ids = db.prepare("SELECT id FROM messages WHERE chatId = ? AND createdAt < ?").all(chatId, cutoffIso).map((r) => r.id);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
  return ids;
}

async function mutate(id, fn) {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  const existing = rowToMessage(row);
  if (!existing) return undefined;
  const updated = fn(existing);
  db.prepare(
    `UPDATE messages SET text = @text, hasLink = @hasLink, editedAt = @editedAt, pinned = @pinned, forwardedFrom = @forwardedFrom,
       attachments = @attachments, keyboard = @keyboard, reactions = @reactions, readByIds = @readByIds,
       deletedForIds = @deletedForIds, anchorForPostId = @anchorForPostId, discussionAnchorId = @discussionAnchorId,
       views = @views, commentCount = @commentCount, linkPreview = @linkPreview, report = @report
     WHERE id = @id`
  ).run({
    id,
    // Реакции и прочтения идут через этот же путь, а текст при них не
    // меняется — тогда остаётся прежний шифротекст, и триггер (db.js,
    // messages_search_au) не перестраивает указатель зря. Изменённый текст
    // шифруется заново, с новым случайным вектором.
    text: (updated.text ?? "") === existing.text ? row.text : encryptText(id, updated.text),
    hasLink: hasLink(updated.text),
    editedAt: updated.editedAt ?? null,
    pinned: updated.pinned ? 1 : 0,
    forwardedFrom: updated.forwardedFrom ? JSON.stringify(updated.forwardedFrom) : null,
    attachments: updated.attachments ? JSON.stringify(updated.attachments) : null,
    keyboard: updated.keyboard ? JSON.stringify(updated.keyboard) : null,
    reactions: JSON.stringify(updated.reactions ?? []),
    readByIds: JSON.stringify(updated.readByIds ?? []),
    deletedForIds: JSON.stringify(updated.deletedForIds ?? []),
    anchorForPostId: updated.anchorForPostId ?? null,
    discussionAnchorId: updated.discussionAnchorId ?? null,
    views: updated.views ?? 0,
    commentCount: updated.commentCount ?? 0,
    linkPreview: updated.linkPreview ? JSON.stringify(updated.linkPreview) : null,
    report: updated.report ? JSON.stringify(updated.report) : null,
  });
  return getMessage(id);
}

// Highlights a message until `until` passes (server/routes/stars.js). Stored
// rather than derived so the highlight survives a reload and every viewer sees
// the same thing.
function setBoost(id, until, byId) {
  db.prepare("UPDATE messages SET boostedUntil = ?, boostedById = ? WHERE id = ?").run(until, byId, id);
  return getMessage(id);
}

function setLinkPreview(id, linkPreview) {
  return mutate(id, (m) => ({ ...m, linkPreview }));
}

// Живая геолокация (composer.js's "Живая геолокация") — периодические
// обновления координат того самого location-вложения, пока не истёк
// meta.expiresAt (see sanitizeAttachments.js). senderId сверяется здесь же,
// на уровне мутации: подменить чужую геолокацию нельзя, даже зная id
// сообщения, потому что "не тот отправитель" оставляет сообщение как есть.
function updateLiveLocation(id, senderId, lat, lng) {
  return mutate(id, (m) => {
    if (m.senderId !== senderId) return m;
    const nowIso = new Date().toISOString();
    const attachments = m.attachments?.map((a) => {
      if (a.kind !== "location" || !a.meta?.live) return a;
      if (a.meta.expiresAt && a.meta.expiresAt <= nowIso) return a; // истекла — не обновляем
      return { ...a, meta: { ...a.meta, lat, lng } };
    });
    return { ...m, attachments };
  });
}

// Проставляет вложению облегчённую копию, досчитанную уже после отправки
// (lib/mediaPreview.js). previewPending снимается в любом случае — в том числе
// когда превью не получилось: висящий навсегда «сейчас будет» хуже, чем
// вложение без превью, которое клиент покажет как раньше, оригиналом.
function setAttachmentPreview(id, index, preview) {
  return mutate(id, (m) => {
    const attachments = m.attachments?.map((a, i) => {
      if (i !== index) return a;
      const next = { ...a, previewPending: undefined };
      for (const [key, value] of Object.entries(preview ?? {})) {
        if (value !== undefined && value !== null) next[key] = value;
      }
      return next;
    });
    return { ...m, attachments };
  });
}

// Flips a report-notification message's embedded status once the admin acts
// on it from messageBubble.js's ReportMessage (see routes/reports.js's
// /:id/resolve) — the buttons there disappear once status !== "open".
function setReportMessageStatus(id, status) {
  return mutate(id, (m) => (m.report ? { ...m, report: { ...m.report, status } } : m));
}

function editMessage(id, text) {
  return mutate(id, (m) => ({ ...m, text, editedAt: new Date().toISOString() }));
}

// "Delete for everyone" — the message is gone, no tombstone left behind.
async function deleteMessage(id) {
  db.prepare("DELETE FROM messages WHERE id = ?").run(id);
}

// "Delete for me" — hidden from just this viewer; still fully visible to
// everyone else in the chat.
function deleteMessageForMe(id, userId) {
  return mutate(id, (m) => {
    const ids = new Set(m.deletedForIds ?? []);
    ids.add(userId);
    return { ...m, deletedForIds: [...ids] };
  });
}

// Заменить клавиатуру под сообщением, не трогая текст — бот так обновляет
// кнопки после нажатия (routes/botApi.js's editMessageKeyboard).
function setKeyboard(id, keyboard) {
  return mutate(id, (m) => ({ ...m, keyboard: Array.isArray(keyboard) && keyboard.length ? keyboard : undefined }));
}

function togglePin(id, pinned) {
  return mutate(id, (m) => ({ ...m, pinned }));
}

function toggleReaction(id, emoji, userId) {
  // Эмодзи приходит из запроса: пустое или неправдоподобно длинное значение —
  // не реакция, а мусор в базе. Отсекаем до мутации.
  const clean = typeof emoji === "string" ? emoji.trim().slice(0, 16) : "";
  if (!clean) return getMessage(id);
  emoji = clean;
  return mutate(id, (m) => {
    const reactions = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(userId)) {
        existing.userIds = existing.userIds.filter((u) => u !== userId);
      } else {
        existing.userIds.push(userId);
      }
    } else {
      reactions.push({ emoji, userIds: [userId] });
    }
    return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
  });
}

function markRead(id, userId) {
  return mutate(id, (m) => (m.readByIds.includes(userId) ? m : { ...m, readByIds: [...m.readByIds, userId] }));
}

// Bulk version of markRead for "viewer opened this chat" — one transaction
// instead of one mutate() per message. Returns the ids that actually changed
// (so callers can skip broadcasting a no-op read receipt).
// Отметка «всё до этого момента прочитано» — ради скорости подсчёта
// непрочитанных (db.js, chat_reads). Ставится ровно там, где чат и правда
// прочитан целиком.
function setReadWatermark(chatId, userId, at) {
  db.prepare(
    `INSERT INTO chat_reads (chatId, userId, lastReadAt) VALUES (?, ?, ?)
     ON CONFLICT(chatId, userId) DO UPDATE SET lastReadAt = excluded.lastReadAt
     WHERE excluded.lastReadAt > chat_reads.lastReadAt`
  ).run(chatId, userId, at);
}

function readWatermarksFor(userId) {
  return new Map(
    db.prepare("SELECT chatId, lastReadAt FROM chat_reads WHERE userId = ?").all(userId).map((r) => [r.chatId, r.lastReadAt])
  );
}

async function markChatRead(chatId, viewerId) {
  // Читаем только непрочитанное этим человеком, а не весь чат. Раньше здесь
  // выбирались все сообщения чата — на каждое открытие переписки в тысячу
  // сообщений это тысяча строк ради двух изменённых.
  const rows = db
    .prepare("SELECT id, senderId, readByIds, createdAt FROM messages WHERE chatId = ? AND senderId <> ? AND readByIds NOT LIKE ?")
    .all(chatId, viewerId, `%"${viewerId}"%`);
  const changedIds = [];
  const update = db.prepare("UPDATE messages SET readByIds = ? WHERE id = ?");
  const txn = db.transaction(() => {
    for (const row of rows) {
      if (row.senderId === viewerId) continue;
      const readByIds = JSON.parse(row.readByIds);
      if (readByIds.includes(viewerId)) continue;
      readByIds.push(viewerId);
      update.run(JSON.stringify(readByIds), row.id);
      changedIds.push(row.id);
    }
  });
  txn();
  // Граница прочитанного — по самому свежему сообщению чата, а не по времени
  // вызова: часы клиента и сервера могут разойтись, а порядок строк — нет.
  const newest = db.prepare("SELECT MAX(createdAt) AS at FROM messages WHERE chatId = ?").get(chatId)?.at;
  if (newest) setReadWatermark(chatId, viewerId, newest);
  return changedIds;
}

// Persisted poll voting — clicking your current option un-votes, clicking a
// different one moves your vote (only one choice per poll, like Telegram).
function votePoll(id, optionIndex, userId) {
  return mutate(id, (m) => {
    const attachments = m.attachments?.map((a) => {
      if (a.kind !== "poll") return a;
      const options = a.meta?.options ?? [];
      // Номер варианта приходит из запроса — вне диапазона (подделанный или
      // битый клиент) оставляет опрос как есть, а не роняет запрос обращением
      // к voterIds[undefined].
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) return a;
      const voterIds = options.map((_, i) => [...(a.meta?.voterIds?.[i] ?? [])]);
      // В викторине ответ даётся один раз и навсегда: иначе можно перебрать все
      // варианты по очереди и «угадать» с гарантией, а вопрос «знал или нет»
      // перестаёт что-либо значить. В обычном опросе голос по-прежнему
      // переставляется и снимается.
      const isQuiz = Number.isInteger(a.meta?.correctIndex);
      if (isQuiz && voterIds.some((ids) => ids.includes(userId))) return a;
      let votedSameAgain = false;
      for (let i = 0; i < voterIds.length; i++) {
        if (voterIds[i].includes(userId)) {
          if (i === optionIndex) votedSameAgain = true;
          voterIds[i] = voterIds[i].filter((v) => v !== userId);
        }
      }
      if (!votedSameAgain) voterIds[optionIndex].push(userId);
      return { ...a, meta: { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) } };
    });
    return { ...m, attachments };
  });
}

// Increments the view counter on a channel post (see server/routes/posts.js).
function incrementViews(id) {
  return mutate(id, (m) => ({ ...m, views: (m.views ?? 0) + 1 }));
}

// Increments the comment counter on a channel post when a reply lands in the
// linked discussion chat (see server/routes/messages.js).
function incrementCommentCount(id) {
  return mutate(id, (m) => ({ ...m, commentCount: (m.commentCount ?? 0) + 1 }));
}

// Stamps the auto-forwarded copy of a post (in the linked discussion chat)
// with the post's own id, so a reply to that copy can be traced back to the
// post whose comment count it should increment (see server/routes/posts.js).
function setAnchorForPost(id, postId) {
  return mutate(id, (m) => ({ ...m, anchorForPostId: postId }));
}

// Stamps the post itself with the id of its auto-forwarded copy in the
// discussion chat, so the client can link "N comments" straight to it.
function setDiscussionAnchor(id, anchorId) {
  return mutate(id, (m) => ({ ...m, discussionAnchorId: anchorId }));
}

// Сколько места занимают вложения в чатах человека — для экрана «Данные и
// память».
//
// Считается в самой базе, а не в JavaScript. Прежний способ выгружал все
// сообщения всех чатов в память и складывал длины там: замер на аккаунте с 212
// чатами — 20 тысяч сообщений и 38 МБ вложений в памяти ради четырёх чисел, и
// это на тестовой истории. У человека с перепиской за годы такой экран съедал
// бы всю доступную память.
//
// json_each разбирает массив вложений средствами SQLite, наружу выходят только
// итоговые суммы. Размер берётся так же, как раньше: явный size, а если его
// нет — длина data:-URL, пересчитанная из base64 в байты (4 знака на 3 байта).
function attachmentBytesByKind(chatIds) {
  if (!chatIds?.length) return {};
  const holes = chatIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT json_extract(a.value, '$.kind') AS kind,
              sum(
                CASE
                  WHEN json_extract(a.value, '$.size') IS NOT NULL THEN json_extract(a.value, '$.size')
                  WHEN json_extract(a.value, '$.url') LIKE 'data:%' THEN
                    (length(json_extract(a.value, '$.url')) - instr(json_extract(a.value, '$.url'), ',')) * 3 / 4
                  ELSE 0
                END
              ) AS bytes
         FROM messages m, json_each(m.attachments) a
        WHERE m.chatId IN (${holes}) AND m.attachments IS NOT NULL AND m.attachments <> '[]'
        GROUP BY kind`
    )
    .all(...chatIds);
  return Object.fromEntries(rows.filter((r) => r.kind).map((r) => [r.kind, r.bytes ?? 0]));
}

// Календарь переписки: в какие дни в этом чате вообще что-то писали.
//
// Даты считаются в часовом поясе того, кто смотрит: createdAt лежит в UTC, а
// «30 августа» для человека в Москве и в Лиссабоне — разные отрезки времени.
// Смещение приходит с клиента в минутах (как его отдаёт getTimezoneOffset, с
// обратным знаком) и подставляется прямо в SQL — считать это перебором в
// JavaScript значило бы вычитать из базы всю переписку ради списка дней.
function listMessageDays(chatId, { month, tzOffsetMinutes = 0 } = {}) {
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(datetime(createdAt, (@tz || ' minutes')), 1, 10) AS day
         FROM messages
        WHERE chatId = @chatId AND threadRootId IS NULL
          AND substr(datetime(createdAt, (@tz || ' minutes')), 1, 7) = @month
        ORDER BY day`
    )
    .all({ chatId, month, tz: tzOffsetMinutes });
  return rows.map((r) => r.day);
}

// Первое сообщение выбранного дня — то, к которому нужно перепрыгнуть.
// Если в этот день не писали, берётся ближайшее следующее: человек ткнул в
// пустой день календаря, и показать ему «ничего нет» менее полезно, чем
// перенести туда, где переписка продолжилась.
function firstMessageOfDay(chatId, { day, tzOffsetMinutes = 0 } = {}) {
  return (
    db
      .prepare(
        `SELECT id, createdAt
           FROM messages
          WHERE chatId = @chatId AND threadRootId IS NULL
            AND substr(datetime(createdAt, (@tz || ' minutes')), 1, 10) >= @day
          ORDER BY createdAt ASC
          LIMIT 1`
      )
      .get({ chatId, day, tz: tzOffsetMinutes }) ?? null
  );
}

// /stats and /top (server/lib/helperBot/moderation.js) — plain aggregate
// queries, no need for a summary table given how infrequently these are asked.
function chatMessageStats(chatId) {
  const total = db.prepare("SELECT COUNT(*) c FROM messages WHERE chatId = ?").get(chatId).c;
  const media = db.prepare("SELECT COUNT(*) c FROM messages WHERE chatId = ? AND attachments IS NOT NULL").get(chatId).c;
  return { total, media };
}

function topSenders(chatId, limit = 10) {
  return db
    .prepare("SELECT senderId, COUNT(*) c FROM messages WHERE chatId = ? GROUP BY senderId ORDER BY c DESC LIMIT ?")
    .all(chatId, limit);
}

module.exports = {
  chatMessageStats,
  topSenders,
  attachmentBytesByKind,
  listMessageDays,
  firstMessageOfDay,
  // Нужен data/chat-summary.js: он читает строки своим запросом и превращает
  // их в сообщения тем же способом, что и остальной код.
  rowToMessage,
  listAllMessages,
  listMediaMessages,
  listNewForBot,
  searchInChats,
  listMessages,
  listMessagesPage,
  listThreadReplies,
  getMessage,
  addMessage,
  deleteMessagesForChat,
  deleteExpiredMessages,
  editMessage,
  deleteMessage,
  deleteMessageForMe,
  togglePin,
  setKeyboard,
  toggleReaction,
  markRead,
  markChatRead,
  setReadWatermark,
  readWatermarksFor,
  votePoll,
  incrementViews,
  incrementCommentCount,
  setAnchorForPost,
  setDiscussionAnchor,
  setLinkPreview,
  updateLiveLocation,
  setAttachmentPreview,
  setReportMessageStatus,
  setBoost,
};
