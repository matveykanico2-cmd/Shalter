const db = require("../db");

function rowToStream(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    hostId: row.hostId,
    title: row.title ?? "",
    withVideo: !!row.withVideo,
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
  if (source !== "rtmp") setParticipant(id, hostId, { role: "host" });
  return getStream(id);
}

function getStreamKey(id) {
  return db.prepare("SELECT streamKey FROM live_streams WHERE id = ?").get(id)?.streamKey ?? null;
}

function getLiveStreamByKey(streamKey) {
  if (!streamKey) return undefined;
  return rowToStream(
    db.prepare("SELECT * FROM live_streams WHERE streamKey = ? AND status = 'live'").get(streamKey)
  );
}

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

function getMessage(id) {
  return db.prepare("SELECT * FROM live_messages WHERE id = ?").get(id);
}

function editMessage(id, text) {
  db.prepare("UPDATE live_messages SET text = ?, editedAt = ? WHERE id = ?").run(text, new Date().toISOString(), id);
  return getMessage(id);
}

function deleteMessage(id) {
  db.prepare("DELETE FROM live_messages WHERE id = ?").run(id);
}

function listMessages(streamId, { limit = 100 } = {}) {
  return db
    .prepare("SELECT * FROM live_messages WHERE streamId = ? ORDER BY createdAt DESC LIMIT ?")
    .all(streamId, limit)
    .reverse();
}

module.exports = {
  getMessage,
  editMessage,
  deleteMessage,
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
