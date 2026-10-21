export function sortChats(list) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      const ao = a.pinOrder ?? Infinity;
      const bo = b.pinOrder ?? Infinity;
      if (ao !== bo) return ao - bo;
    }
    const at = a.lastMessage?.createdAt ?? a.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? b.createdAt ?? "";
    return bt.localeCompare(at);
  });
}

// Выключенный на время звук (muted + mutedUntil) сам включается по истечении срока.
export function isChatMuted(chat) {
  if (chat.mutedUntil) return new Date(chat.mutedUntil).getTime() > Date.now();
  return !!chat.muted;
}
