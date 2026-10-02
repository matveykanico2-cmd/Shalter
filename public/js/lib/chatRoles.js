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

export function memberRoleLabel(chat, userId) {
  const custom = chat.memberTitles?.[userId];
  if (custom) return custom;
  if (isChatOwner(chat, userId)) return "владелец";
  if ((chat.adminIds ?? []).includes(userId)) return "админ";
  if (isChatModerator(chat, userId)) return "модератор";
  return null;
}
