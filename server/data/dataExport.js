const db = require("../db");
const { genId } = require("../lib/genId");
const { listAllMessages } = require("./messages");
const { listChats } = require("./chats");
const { listUsers, getUser } = require("./users");

const LEGACY_CIPHER_PREFIX = "e2e1:";

function isEncrypted(text) {
  return typeof text === "string" && text.startsWith(LEGACY_CIPHER_PREFIX);
}

// respectPrivacy — выгрузка для самого пользователя (/api/export): телефоны
// собеседников и участников групп — только те, что он и так видит по их
// настройкам приватности (и не заблокировавших его). Юридическому отделу
// (/api/admin/export) — все номера.
async function buildUserExport(targetUserId, { respectPrivacy = false } = {}) {
  const target = await getUser(targetUserId);
  if (!target) return null;

  const [allChats, allMessages, allUsers] = await Promise.all([listChats(), listAllMessages(), listUsers()]);

  // Секретные чаты в экспорт не попадают — как в Telegram.
  const memberChats = allChats.filter((c) => c.memberIds.includes(targetUserId) && !c.secret);

  let phoneVisible = () => true;
  if (respectPrivacy) {
    const { allowsUser } = require("../lib/privacyRules");
    const memberChatIds = new Set(memberChats.map((c) => c.id));
    const people = new Set(memberChats.flatMap((c) => c.memberIds));
    for (const m of allMessages) if (memberChatIds.has(m.chatId) && m.senderId) people.add(m.senderId);
    const visible = new Set([targetUserId]);
    for (const id of people) {
      if (id === targetUserId) continue;
      const u = allUsers.find((x) => x.id === id);
      if (!u || (u.blockedUserIds ?? []).includes(targetUserId)) continue;
      if (await allowsUser(id, "phone", targetUserId)) visible.add(id);
    }
    phoneVisible = (id) => visible.has(id);
  }

  const userLabel = (id) => {
    const u = allUsers.find((x) => x.id === id);
    return u ? { id, name: u.name, username: u.username || undefined, phone: (phoneVisible(id) && u.phone) || undefined } : { id };
  };

  let messageCount = 0;
  let sentMessageCount = 0;
  const media = [];
  const chats = memberChats.map((chat) => {
    const msgs = allMessages
      .filter((m) => m.chatId === chat.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((m) => {
          messageCount++;
          if (m.senderId === targetUserId) sentMessageCount++;
          const encrypted = isEncrypted(m.text);
          const attachments = (m.attachments?.length ? m.attachments : []).map((a) => {
            const entry = {
              kind: a.kind,
              name: a.name,
              size: a.size || undefined,
              mimeType: a.mimeType || undefined,
              durationSec: a.durationSec || undefined,
              width: a.width || undefined,
              height: a.height || undefined,
              url: a.url || undefined,
            };
            if (typeof a.url === "string" && a.url.startsWith("/uploads/")) {
              const filename = a.url.slice("/uploads/".length);
              media.push({
                chatId: chat.id,
                chatType: chat.type,
                chatTitle: chat.title || chat.name || undefined,
                messageId: m.id,
                at: m.createdAt,
                from: userLabel(m.senderId),
                sentByTarget: m.senderId === targetUserId,
                kind: a.kind,
                name: a.name,
                size: a.size || undefined,
                mimeType: a.mimeType || undefined,
                durationSec: a.durationSec || undefined,
                width: a.width || undefined,
                height: a.height || undefined,
                url: a.url,
                downloadUrl: `/api/admin/export/media/${filename}`,
              });
            }
            return entry;
          });
          return {
            id: m.id,
            at: m.createdAt,
            from: userLabel(m.senderId),
            ...(m.senderId === targetUserId ? { sentByTarget: true } : {}),
            type: m.type,
            text: encrypted ? "[Устаревшее E2E-сообщение — сервер не имеет ключей, содержимое недоступно]" : m.text,
            ...(encrypted ? { encrypted: true, ciphertext: m.text } : {}),
            ...(m.editedAt ? { editedAt: m.editedAt } : {}),
            ...(m.replyToId ? { replyToId: m.replyToId } : {}),
            ...(attachments.length ? { attachments } : {}),
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
    stats: {
      chatCount: chats.length,
      messageCount,
      sentMessageCount,
      mediaCount: media.length,
      byKind: media.reduce((acc, m) => {
        acc[m.kind] = (acc[m.kind] || 0) + 1;
        return acc;
      }, {}),
    },
    chats,
    media,
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
