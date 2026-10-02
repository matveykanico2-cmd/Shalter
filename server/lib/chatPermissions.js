const PERMISSIONS = [
  { id: "sendMessages", label: "Отправлять сообщения" },
  { id: "sendMedia", label: "Отправлять фото и файлы" },
  { id: "sendStickers", label: "Отправлять стикеры и подарки" },
  { id: "sendPolls", label: "Создавать опросы" },
  { id: "addMembers", label: "Добавлять участников" },
  { id: "pinMessages", label: "Закреплять сообщения" },
];

const DEFAULTS = Object.fromEntries(PERMISSIONS.map((p) => [p.id, true]));

function permissionsOf(chat) {
  return { ...DEFAULTS, ...(chat?.permissions ?? {}) };
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
  if (!chat || chat.type !== "group") return true;
  if (isStaff(chat, userId)) return true;
  return permissionsOf(chat)[what] !== false;
}

const DENIED = {
  sendMessages: "В этой группе писать могут только администраторы",
  sendMedia: "В этой группе нельзя отправлять фото и файлы",
  sendStickers: "В этой группе нельзя отправлять стикеры",
  sendPolls: "В этой группе нельзя создавать опросы",
  addMembers: "В этой группе добавлять участников могут только администраторы",
  pinMessages: "В этой группе закреплять сообщения могут только администраторы",
};

module.exports = { PERMISSIONS, DEFAULTS, permissionsOf, sanitizePermissions, can, isStaff, DENIED };
