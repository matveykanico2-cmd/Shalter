// Порядок строк списка чатов — один на всё приложение: колонка слева
// (views/chatList.js), страница архива (views/archive.js) и Alt+↑/↓
// (lib/keyboardShortcuts.js). Раньше у каждого была своя копия сравнения, и
// стоило одной из них научиться новому (порядку закреплённых), как остальные
// начинали расходиться с тем, что на экране.
//
// Сначала закреплённые — в том порядке, в каком их расставил человек
// (pinOrder с сервера, см. server/data/chat-summary.js; перетаскиванием в
// списке); закреплённые без места идут за ними. Дальше всё остальное — по
// свежести последнего сообщения.
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

// Заглушён ли чат сейчас — навсегда или на срок, который ещё не вышел.
// Сервер отдаёт срочную тишину отдельным полем (mutedUntil, а muted при этом
// false), и строка списка по одному muted не показывала перечёркнутый
// колокольчик у чата, заглушённого «на час».
export function isChatMuted(chat) {
  if (chat.muted) return true;
  return !!chat.mutedUntil && new Date(chat.mutedUntil).getTime() > Date.now();
}
