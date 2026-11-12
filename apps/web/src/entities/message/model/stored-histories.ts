// Ленты чатов прошлого запуска (IndexedDB): открытый чат сразу показывает последние
// сообщения, запрос истории приходит поверх. Только лента всего чата (не темы) и только
// когда она совпадает с последним сообщением из списка чатов, — иначе ждём сервер.
import type { Query, QueryClient } from "@tanstack/react-query";

import { idbDelete, idbEntries, idbPut } from "@/shared/lib/idb-store";
import { cacheGeneration, onCacheCleared } from "@/shared/lib/local-cache";
import { persistQueries } from "@/shared/lib/persist-queries";

import { messageQueries, PAGE_SIZE } from "../api/message-queries";

import type { History } from "./types";

const STORE = "histories";
/** Сколько чатов помним; самые давние выбрасываем. */
const MAX_CHATS = 40;
const SAVE_DELAY_MS = 1500;

type Stored = { userId: string; chatId: string; at: number; history: History };

const keyOf = (userId: string, chatId: string) => `${userId}:${chatId}`;
/** Ленты пользователя memoryOwner по chatId. Выход стирает их вместе с кэшем устройства. */
const memory = new Map<string, Stored>();
let memoryOwner: string | null = null;
onCacheCleared(() => {
  memory.clear();
  memoryOwner = null;
});

/** Ленты в памяти — только этого пользователя: чужие (прежнего аккаунта) выбрасываем. */
function ownMemory(userId: string) {
  if (memoryOwner !== userId) {
    memory.clear();
    memoryOwner = userId;
  }
}

export async function loadStoredHistories(userId: string) {
  ownMemory(userId);
  const generation = cacheGeneration();
  const entries = await idbEntries<Stored>(STORE);
  // Пока читали, кэш стёрли (выход) или вошёл другой — прочитанное уже не нужно.
  if (generation !== cacheGeneration() || memoryOwner !== userId) return;
  // Сохранённое за время чтения — новее прочитанного.
  for (const [, v] of entries) if (v?.userId === userId && v.history && !memory.has(v.chatId)) memory.set(v.chatId, v);
}

/** Лента из прошлого запуска, если её последнее сообщение — последнее в чате и сейчас. */
export function storedHistory(chatId: string, lastMessageId: string | null | undefined): History | undefined {
  const stored = memory.get(chatId);
  if (!stored || !lastMessageId) return undefined;
  return stored.history.messages.at(-1)?.id === lastMessageId ? stored.history : undefined;
}

/** Последняя страница ленты, без своих неотправленных и отметки непрочитанных. */
function snapshot(history: History): History | null {
  const sent = history.messages.filter((m) => !m.pending);
  if (!sent.length) return null;
  const messages = sent.slice(-PAGE_SIZE);
  return { messages, hasMore: history.hasMore || messages.length < sent.length, firstUnreadId: null, replyTargets: history.replyTargets, unconfirmed: [] };
}

/**
 * Каждое обновление ленты всего чата — в IndexedDB (не чаще раза в SAVE_DELAY_MS на чат).
 * keep — какие чаты можно хранить (секретные — нет). Возвращает отписку.
 */
export function persistHistories(client: QueryClient, userId: string, keep: (chatId: string) => boolean) {
  ownMemory(userId);
  const save = (chatId: string) => {
    if (!keep(chatId) || memoryOwner !== userId) return;
    const data = client.getQueryData(messageQueries.history(chatId).queryKey);
    const history = data && snapshot(data);
    if (!history) return;
    const stored: Stored = { userId, chatId, at: Date.now(), history };
    memory.set(chatId, stored);
    void idbPut(STORE, keyOf(userId, chatId), stored);
    if (memory.size <= MAX_CHATS) return;
    const oldest = [...memory.values()].sort((a, b) => a.at - b.at).slice(0, memory.size - MAX_CHATS);
    for (const s of oldest) memory.delete(s.chatId);
    void idbDelete(STORE, oldest.map((s) => keyOf(userId, s.chatId)));
  };
  const pick = (query: Query) => {
    const [base, kind, chatId, topic] = query.queryKey as readonly unknown[];
    return base === messageQueries.baseKey[0] && kind === "history" && topic === "all" && typeof chatId === "string" ? chatId : null;
  };
  return persistQueries(client, pick, save, SAVE_DELAY_MS);
}
