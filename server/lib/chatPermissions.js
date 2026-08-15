// What ordinary members of a group may do.
//
// Admins, moderators and owners are never bound by this — the list exists to
// describe everyone *else*, which is the only thing it would be used for. A
// chat with no list set allows everything, so this is opt-in and no existing
// group changes behaviour by its introduction.
//
// Channels are deliberately absent: posting there is already admin-only by
// design (routes/messages.js), and a second, weaker mechanism saying the same
// thing is how two rules end up disagreeing.
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

// Only the listed keys survive, and only as booleans — this comes straight off
// a request body, and an unchecked spread would let anything be written into
// the column.
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

// `true` when this person may do `what` here. Anything that isn't a group is
// unaffected: a DM has no members to restrict, a channel has its own rule.
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
