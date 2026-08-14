// Who holds what in a chat.
//
// A chat can have several owners: chat.ownerIds is the list that grants the
// rights, and chat.ownerId is kept as the creator for chats that predate it (see
// server/db.js's isOwner flag). Every check has to consult both, which is exactly
// the kind of thing that gets forgotten at one call site out of five — so it
// lives here instead of being written out inline.
export function isChatOwner(chat, userId) {
  if (!chat || !userId) return false;
  return chat.ownerId === userId || (chat.ownerIds ?? []).includes(userId);
}

export function isChatAdmin(chat, userId) {
  return isChatOwner(chat, userId) || (chat.adminIds ?? []).includes(userId);
}

export function isChatModerator(chat, userId) {
  return (chat.moderatorIds ?? []).includes(userId);
}

// The word shown next to a member. An owner-set custom title wins over the real
// role — that's the whole point of it ("вместо «участник» — «пользователь»") —
// and a plain member with no title gets nothing rather than the noise of a label
// that says what everyone already is.
export function memberRoleLabel(chat, userId) {
  const custom = chat.memberTitles?.[userId];
  if (custom) return custom;
  if (isChatOwner(chat, userId)) return "владелец";
  if ((chat.adminIds ?? []).includes(userId)) return "админ";
  if (isChatModerator(chat, userId)) return "модератор";
  return null;
}
