const db = require("../db");
const { genId } = require("../lib/genId");
const { listAllMessages } = require("./messages");
const { listChats } = require("./chats");
const { listUsers, getUser } = require("./users");

const LEGACY_CIPHER_PREFIX = "e2e1:";

function isEncrypted(text) {
  return typeof text === "string" && text.startsWith(LEGACY_CIPHER_PREFIX);
}

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

function logExport({ adminId, targetUserId, reason, messageCount }) {
  const row = {
    id: genId("exp"),
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

function listExports() {
  return db.prepare("SELECT * FROM data_exports ORDER BY createdAt DESC LIMIT 200").all();
}

module.exports = { buildUserExport, logExport, listExports };
