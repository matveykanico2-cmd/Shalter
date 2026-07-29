import { readCollection, updateCollection } from "./store";
import type { Chat } from "../types";

const FILE = "chats";

export async function listChats(): Promise<Chat[]> {
  return readCollection<Chat>(FILE);
}

export async function listChatsForUser(userId: string): Promise<Chat[]> {
  const chats = await listChats();
  return chats.filter((c) => c.memberIds.includes(userId));
}

export async function getChat(id: string): Promise<Chat | undefined> {
  const chats = await listChats();
  return chats.find((c) => c.id === id);
}

export async function updateChat(id: string, patch: Partial<Chat>): Promise<Chat | undefined> {
  let updated: Chat | undefined;
  await updateCollection<Chat>(FILE, (chats) =>
    chats.map((c) => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch };
      return updated;
    })
  );
  return updated;
}

export async function createChat(chat: Chat): Promise<Chat> {
  await updateCollection<Chat>(FILE, (chats) => [...chats, chat]);
  return chat;
}

export async function deleteChat(id: string): Promise<void> {
  await updateCollection<Chat>(FILE, (chats) => chats.filter((c) => c.id !== id));
}
