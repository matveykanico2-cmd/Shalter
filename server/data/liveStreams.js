const db = require("../db");

// Эфиры: данные. Логика прав и рассылок — в server/routes/live.js.
//
// Эфир живёт, пока его ведёт ведущий. Одновременно в одном чате идёт не более
// одного — иначе «зайти в эфир» перестаёт быть однозначным действием и
// подписчику приходится выбирать из списка, которого он не просил.

function rowToStream(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    hostId: row.hostId,
    title: row.title ?? "",
    withVideo: !!row.withVideo,
    // "webrtc" — ведущий вещает из браузера, "rtmp" — картинку присылает
    // внешняя программа вроде OBS (server/rtmp.js). streamKey сознательно не
    // отдаётся отсюда наружу: это пароль на вещание, и его выдаёт только
    // routes/live.js и только ведущему.
    source: row.source ?? "webrtc",
    rtmpLive: !!row.rtmpLive,
    status: row.status,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
  };
}

function rowToParticipant(row) {
  if (!row) return undefined;
  return {
    userId: row.userId,
    role: row.role,
    handRaised: !!row.handRaised,
    mutedByHost: !!row.mutedByHost,
    joinedAt: row.joinedAt,
  };
}

function getStream(id) {
  return rowToStream(db.prepare("SELECT * FROM live_streams WHERE id = ?").get(id));
}

function getLiveStreamForChat(chatId) {
  return rowToStream(db.prepare("SELECT * FROM live_streams WHERE chatId = ? AND status = 'live' ORDER BY startedAt DESC LIMIT 1").get(chatId));
}

// Эфиры во всех чатах человека — чтобы список чатов мог показать «в эфире» без
// запроса на каждый чат по отдельности.
function listLiveStreamsForUser(userId) {
  return db
    .prepare(
      `SELECT s.* FROM live_streams s
         JOIN chat_members m ON m.chatId = s.chatId AND m.userId = ?
        WHERE s.status = 'live'`
    )
    .all(userId)
    .map(rowToStream);
}

function createStream({ chatId, hostId, title, withVideo, source = "webrtc", streamKey = null }) {
  const id = `live_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO live_streams (id, chatId, hostId, title, withVideo, status, startedAt, source, streamKey) VALUES (?, ?, ?, ?, ?, 'live', ?, ?, ?)"
  ).run(id, chatId, hostId, title ?? "", withVideo ? 1 : 0, startedAt, source, streamKey);
  // Ведущего эфира из OBS в участники не записываем: он может вообще не
  // открывать страницу — вещает программа, а не вкладка браузера. Запись
  // появится, когда он зайдёт посмотреть свой же эфир, как и у всех остальных.
  if (source !== "rtmp") setParticipant(id, hostId, { role: "host" });
  return getStream(id);
}

// Ключ потока читается ровно в двух местах: когда RTMP-сервер решает, пускать
// ли вещание (server/rtmp.js), и когда прокси идёт за картинкой для зрителя
// (server/routes/live.js). Наружу он не уходит ни из одного из них.
function getStreamKey(id) {
  return db.prepare("SELECT streamKey FROM live_streams WHERE id = ?").get(id)?.streamKey ?? null;
}

function getLiveStreamByKey(streamKey) {
  if (!streamKey) return undefined;
  return rowToStream(
    db.prepare("SELECT * FROM live_streams WHERE streamKey = ? AND status = 'live'").get(streamKey)
  );
}

// «Программа на связи» — включается, когда OBS начал вещать, и гаснет, когда
// он отключился. Сам эфир при этом продолжает идти: ведущий мог перезапустить
// программу, и терять из-за этого чат и собравшихся зрителей незачем.
function setRtmpLive(id, live) {
  db.prepare("UPDATE live_streams SET rtmpLive = ? WHERE id = ?").run(live ? 1 : 0, id);
  return getStream(id);
}

function endStream(id) {
  db.prepare("UPDATE live_streams SET status = 'ended', endedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
  return getStream(id);
}

function listParticipants(streamId) {
  return db.prepare("SELECT * FROM live_participants WHERE streamId = ? ORDER BY joinedAt ASC").all(streamId).map(rowToParticipant);
}

function getParticipant(streamId, userId) {
  return rowToParticipant(db.prepare("SELECT * FROM live_participants WHERE streamId = ? AND userId = ?").get(streamId, userId));
}

// Вход и любое изменение состояния участника — одним местом: у входа и у
// «разрешить говорить» разной должна быть только роль, а не путь в коде.
function setParticipant(streamId, userId, patch = {}) {
  const existing = getParticipant(streamId, userId);
  const next = {
    role: patch.role ?? existing?.role ?? "viewer",
    handRaised: patch.handRaised ?? existing?.handRaised ?? false,
    mutedByHost: patch.mutedByHost ?? existing?.mutedByHost ?? false,
  };
  db.prepare(
    `INSERT INTO live_participants (streamId, userId, role, handRaised, mutedByHost, joinedAt)
     VALUES (@streamId, @userId, @role, @handRaised, @mutedByHost, @joinedAt)
     ON CONFLICT(streamId, userId) DO UPDATE SET role = @role, handRaised = @handRaised, mutedByHost = @mutedByHost`
  ).run({
    streamId,
    userId,
    role: next.role,
    handRaised: next.handRaised ? 1 : 0,
    mutedByHost: next.mutedByHost ? 1 : 0,
    joinedAt: existing?.joinedAt ?? new Date().toISOString(),
  });
  return getParticipant(streamId, userId);
}

function removeParticipant(streamId, userId) {
  db.prepare("DELETE FROM live_participants WHERE streamId = ? AND userId = ?").run(streamId, userId);
}

function addMessage(streamId, userId, text) {
  const message = {
    id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    streamId,
    userId,
    text,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO live_messages (id, streamId, userId, text, createdAt) VALUES (@id, @streamId, @userId, @text, @createdAt)").run(message);
  return message;
}

// Последние N сообщений чата эфира: он живёт минутами и читается «с конца»,
// поэтому отдаём хвост, а не всю ленту с начала.
function listMessages(streamId, { limit = 100 } = {}) {
  return db
    .prepare("SELECT * FROM live_messages WHERE streamId = ? ORDER BY createdAt DESC LIMIT ?")
    .all(streamId, limit)
    .reverse();
}

module.exports = {
  getStreamKey,
  getLiveStreamByKey,
  setRtmpLive,
  getStream,
  getLiveStreamForChat,
  listLiveStreamsForUser,
  createStream,
  endStream,
  listParticipants,
  getParticipant,
  setParticipant,
  removeParticipant,
  addMessage,
  listMessages,
};
