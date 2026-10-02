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

export function isChatMuted(chat) {
  if (chat.muted) return true;
  return !!chat.mutedUntil && new Date(chat.mutedUntil).getTime() > Date.now();
}
