// Роли в чате. Владельцев может быть несколько (ownerIds); у старых чатов есть только ownerId.
interface Staffed {
  ownerId?: string;
  ownerIds?: string[];
  adminIds?: string[];
}

export function isOwner(chat: Staffed | undefined, userId: string | undefined): boolean {
  return !!chat && (chat.ownerId === userId || (!!userId && (chat.ownerIds ?? []).includes(userId)));
}

export function isOwnerOrAdminOf(chat: Staffed | undefined, userId: string | undefined): boolean {
  return isOwner(chat, userId) || (!!chat && !!userId && (chat.adminIds ?? []).includes(userId));
}
