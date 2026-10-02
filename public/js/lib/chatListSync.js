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
