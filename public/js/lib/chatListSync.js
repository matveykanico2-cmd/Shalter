import { getState, setState } from "../state.js";

export function noteMessageInChatList(chatId, message) {
  if (!message?.createdAt || message.threadRootId) return;

  const { chats } = getState();
  const target = chats.find((c) => c.id === chatId);
  if (!target) return;
  if (target.lastMessage && target.lastMessage.createdAt > message.createdAt) return;

  setState({
    chats: chats.map((c) => (c.id === chatId ? { ...c, lastMessage: message } : c)),
  });
}

// Правка или удаление последнего сообщения меняет превью в списке чатов.
export function updateMessageInChatList(chatId, message) {
  if (!message?.id) return;
  const { chats } = getState();
  const target = chats.find((c) => c.id === chatId);
  if (!target || target.lastMessage?.id !== message.id) return;
  setState({
    chats: chats.map((c) => (c.id === chatId ? { ...c, lastMessage: { ...c.lastMessage, ...message } } : c)),
  });
}

// Удалили последнее сообщение — превью сразу показывает предыдущее, а не висит до перезапроса.
export function dropMessageFromChatList(chatId, messageIds, remaining = null) {
  const gone = new Set([].concat(messageIds));
  // Открытый профиль убирает удалённое из вкладок «Медиа», «Голосовые» и т. д.
  window.dispatchEvent(new CustomEvent("shalter:messages-deleted", { detail: { chatId, ids: [...gone] } }));
  const { chats } = getState();
  const target = chats.find((c) => c.id === chatId);
  if (!target?.lastMessage || !gone.has(target.lastMessage.id)) return;
  const prev = remaining
    ? [...remaining].reverse().find((m) => !gone.has(m.id) && !m.pending && !m.threadRootId && m.createdAt) ?? null
    : null;
  setState({
    chats: chats.map((c) => (c.id === chatId ? { ...c, lastMessage: prev } : c)),
  });
}
