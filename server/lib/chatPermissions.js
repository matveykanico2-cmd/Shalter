const PERMISSIONS = [
  { id: "sendMessages", label: "Отправлять сообщения" },
  { id: "sendMedia", label: "Отправлять фото и файлы" },
  { id: "sendStickers", label: "Отправлять стикеры и подарки" },
  { id: "sendPolls", label: "Создавать опросы" },
  { id: "addMembers", label: "Добавлять участников" },
  { id: "pinMessages", label: "Закреплять сообщения" },
  { id: "createTopics", label: "Создавать темы" },
  { id: "setOwnTag", label: "Ставить себе тег" },
];
const MEMBER_PERMISSIONS = [...PERMISSIONS, { id: "commentPosts", label: "Оставлять комментарии" }, { id: "publishPosts", label: "Публиковать в канале" }, { id: "editMessages", label: "Редактировать свои сообщения" }, { id: "deleteMessages", label: "Удалять свои сообщения" }];

const DEFAULTS = Object.fromEntries(PERMISSIONS.map((p) => [p.id, true]));
const MEMBER_DEFAULTS = Object.fromEntries(MEMBER_PERMISSIONS.map((p) => [p.id, true]));

function permissionsOf(chat) {
  const { members: _members, ...global } = chat?.permissions ?? {};
  return { ...DEFAULTS, ...global };
}

function sanitizePermissions(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const p of PERMISSIONS) out[p.id] = raw[p.id] !== false;
  return out;
}

function isStaff(chat, userId) {
  return (
    chat?.ownerId === userId ||
    (chat?.ownerIds ?? []).includes(userId) ||
    (chat?.adminIds ?? []).includes(userId) ||
    (chat?.moderatorIds ?? []).includes(userId)
  );
}

function can(chat, userId, what) {
  if (!chat || (chat.type !== "group" && chat.type !== "channel")) return true;
  if (isStaff(chat, userId)) return true;
  return { ...MEMBER_DEFAULTS, ...permissionsOf(chat), ...(chat?.permissions?.members?.[userId] ?? {}) }[what] !== false;
}

const DENIED = {
  sendMessages: "В этой группе писать могут только администраторы",
  sendMedia: "В этой группе нельзя отправлять фото и файлы",
  sendStickers: "В этой группе нельзя отправлять стикеры",
  sendPolls: "В этой группе нельзя создавать опросы",
  addMembers: "В этой группе добавлять участников могут только администраторы",
  pinMessages: "В этой группе закреплять сообщения могут только администраторы",
  createTopics: "В этой группе создавать темы могут только администраторы",
  setOwnTag: "В этой группе теги ставят только администраторы",
  commentPosts: "Вам нельзя оставлять комментарии",
  publishPosts: "Публиковать в канале могут только администраторы",
  editMessages: "Вам нельзя редактировать сообщения",
  deleteMessages: "Вам нельзя удалять сообщения",
};

function sanitizeMemberPermissions(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(MEMBER_PERMISSIONS.map(({ id }) => [id, source[id] !== false]));
}

module.exports = { PERMISSIONS, MEMBER_PERMISSIONS, DEFAULTS, permissionsOf, sanitizePermissions, sanitizeMemberPermissions, can, isStaff, DENIED };
