const db = require("../db");
const { listAllMessages } = require("./messages");
const { listChats } = require("./chats");
const { listUsers, getUser } = require("./users");

// Lawful-request data export for ONE target user — assembles the stored
// correspondence a regulator/court order can legitimately compel, and
// nothing more. This is the transparent, targeted alternative to a covert
// "read everyone" backdoor: it only reaches what already sits in the DB,
// it's scoped to a single named account, and every run is logged
// (logExport below / db.js's data_exports table).
//
// Secret (E2E) chats are gone from the app, so nothing here is ciphertext
// any more — apart from the legacy marker below, kept only so a database
// that still holds messages from before the removal exports them honestly
// (as ciphertext, flagged) instead of dumping "e2e1:AbCd…" as if it were the
// message someone actually typed.

const LEGACY_CIPHER_PREFIX = "e2e1:";

function isEncrypted(text) {
  return typeof text === "string" && text.startsWith(LEGACY_CIPHER_PREFIX);
}

// Everything the target account was party to: every chat it's a member of,
// and every message in those chats (so the export shows the actual
// back-and-forth, not just the target's own lines out of context).
async function buildUserExport(targetUserId) {
  const target = await getUser(targetUserId);
  if (!target) return null;

  const [allChats, allMessages, allUsers] = await Promise.all([listChats(), listAllMessages(), listUsers()]);

  const userLabel = (id) => {
    const u = allUsers.find((x) => x.id === id);
    return u ? { id, name: u.name, username: u.username || undefined, phone: u.phone || undefined } : { id };
  };

  const memberChats = allChats.filter((c) => c.memberIds.includes(targetUserId));

  let messageCount = 0;
  const chats = memberChats.map((chat) => {
    const msgs = allMessages
      .filter((m) => m.chatId === chat.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => {
        messageCount++;
        const encrypted = isEncrypted(m.text);
        return {
          id: m.id,
          at: m.createdAt,
          from: userLabel(m.senderId),
          type: m.type,
          text: encrypted ? "[Устаревшее E2E-сообщение — сервер не имеет ключей, содержимое недоступно]" : m.text,
          ...(encrypted ? { encrypted: true, ciphertext: m.text } : {}),
          ...(m.editedAt ? { editedAt: m.editedAt } : {}),
          ...(m.replyToId ? { replyToId: m.replyToId } : {}),
          ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ kind: a.kind, name: a.name, size: a.size })) } : {}),
        };
      });
    return {
      chatId: chat.id,
      type: chat.type,
      title: chat.title || undefined,
      members: chat.memberIds.map(userLabel),
      messageCount: msgs.length,
      messages: msgs,
    };
  });

  return {
    // A header block that makes the file self-describing for whoever
    // receives it — what it is and who it's about, stated up front rather
    // than buried.
    export: {
      kind: "lawful-request-user-export",
      generatedAt: new Date().toISOString(),
      note:
        "Выгрузка хранимых данных одного аккаунта по адресному запросу. " +
        "Сообщения с пометкой encrypted остались от удалённой функции секретных чатов: ключи были только на устройствах собеседников, " +
        "сервер не может расшифровать их содержимое — они приведены как есть (шифротекст).",
    },
    target: {
      id: target.id,
      name: target.name,
      username: target.username || undefined,
      phone: target.phone || undefined,
      email: target.email || undefined,
      createdAtFirstSeen: target.lastSeen || undefined,
    },
    stats: { chatCount: chats.length, messageCount },
    chats,
  };
}

// One audit row per export. Returns the row so the route can surface an
// export id / confirmation to the admin.
function logExport({ adminId, targetUserId, reason, messageCount }) {
  const row = {
    id: `exp_${Date.now()}`,
    adminId,
    targetUserId,
    reason,
    messageCount,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO data_exports (id, adminId, targetUserId, reason, messageCount, createdAt)
     VALUES (@id, @adminId, @targetUserId, @reason, @messageCount, @createdAt)`
  ).run(row);
  return row;
}

// The transparency log, newest first — shown back in the admin UI so past
// exports are visible, not hidden.
function listExports() {
  return db.prepare("SELECT * FROM data_exports ORDER BY createdAt DESC LIMIT 200").all();
}

module.exports = { buildUserExport, logExport, listExports };
