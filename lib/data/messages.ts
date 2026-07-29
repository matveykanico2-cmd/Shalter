import { readCollection, updateCollection } from "./store";
import type { Message, Reaction } from "../types";

const FILE = "messages";

export async function listAllMessages(): Promise<Message[]> {
  return readCollection<Message>(FILE);
}

export async function listMessages(chatId: string): Promise<Message[]> {
  const all = await listAllMessages();
  return all
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getMessage(id: string): Promise<Message | undefined> {
  const all = await listAllMessages();
  return all.find((m) => m.id === id);
}

export async function addMessage(message: Message): Promise<Message> {
  await updateCollection<Message>(FILE, (all) => [...all, message]);
  return message;
}

export async function deleteMessagesForChat(chatId: string): Promise<void> {
  await updateCollection<Message>(FILE, (all) => all.filter((m) => m.chatId !== chatId));
}

async function mutate(id: string, fn: (m: Message) => Message): Promise<Message | undefined> {
  let updated: Message | undefined;
  await updateCollection<Message>(FILE, (all) =>
    all.map((m) => {
      if (m.id !== id) return m;
      updated = fn(m);
      return updated;
    })
  );
  return updated;
}

export function editMessage(id: string, text: string) {
  return mutate(id, (m) => ({ ...m, text, editedAt: new Date().toISOString() }));
}

export function deleteMessage(id: string) {
  return mutate(id, (m) => ({ ...m, deleted: true, text: "" }));
}

export function togglePin(id: string, pinned: boolean) {
  return mutate(id, (m) => ({ ...m, pinned }));
}

export function toggleReaction(id: string, emoji: string, userId: string) {
  return mutate(id, (m) => {
    const reactions: Reaction[] = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(userId)) {
        existing.userIds = existing.userIds.filter((u) => u !== userId);
      } else {
        existing.userIds.push(userId);
      }
    } else {
      reactions.push({ emoji, userIds: [userId] });
    }
    return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
  });
}

export function markRead(id: string, userId: string) {
  return mutate(id, (m) =>
    m.readByIds.includes(userId) ? m : { ...m, readByIds: [...m.readByIds, userId] }
  );
}
