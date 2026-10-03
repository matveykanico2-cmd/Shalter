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
