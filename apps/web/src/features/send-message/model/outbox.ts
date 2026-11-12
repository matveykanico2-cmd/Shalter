// Очередь исходящих: своё сообщение лежит здесь (и в IndexedDB) с нажатия «Отправить» до
// ответа сервера. Обрыв сети, таймаут, 5xx, 429 — повтор, сколько бы ни заняло: пузырь
// «отправляется» не пропадает, а закрытое приложение досылает очередь при следующем запуске.
// Дубля не будет: clientId сервер хранит в базе (messages.clientId). Отказ по существу (4xx:
// нет прав, слишком длинно) — пузырь убираем, ошибка уходит отправителю.
// В одном чате сообщения уходят строго по очереди — порядок не перемешается.
import type { QueryClient } from "@tanstack/react-query";

import { chatCache } from "@/entities/chat";
import { type FeedMessage, historyCache, type Message, setPendingSource } from "@/entities/message";

import { ApiError } from "@/shared/api";
import { idbDelete, idbEntries, idbPut } from "@/shared/lib/idb-store";
import { onCacheCleared } from "@/shared/lib/local-cache";
import { toast } from "@/shared/ui";

import { type SendBody,sendMessage } from "../api/send-message";

export type OutboxEntry = {
  userId: string;
  chatId: string;
  channel: boolean;
  body: SendBody;
  /** Пузырь в ленте: id = body.clientId. */
  pending: FeedMessage;
  createdAt: number;
};

/** Сколько ждём ответа на одну попытку: дольше — соединение «повисло», пробуем снова. */
export const ATTEMPT_TIMEOUT_MS = 30_000;
const FIRST_DELAY_MS = 1500;
const MAX_DELAY_MS = 30_000;

const STORE = "outbox";
const entries = new Map<string, OutboxEntry>();
const queues = new Map<string, Promise<void>>();
const waiters = new Map<string, { resolve: (m: Message) => void; reject: (err: unknown) => void }>();
let generation = 0;

onCacheCleared(() => {
  // Выход: очередь вышедшего не досылается и не остаётся на устройстве (база уже стёрта).
  generation++;
  entries.clear();
  for (const w of waiters.values()) w.reject(new Error("signed out"));
  waiters.clear();
});

setPendingSource((chatId) => [...entries.values()].filter((e) => e.chatId === chatId).map((e) => e.pending));

/** Новая метка отправки: уникальна и после перезапуска приложения. */
export function newClientId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `c_${random}`;
}

/** Повторять ли: сеть, таймаут, сервер перегружен или недоступен. Остальное — отказ по существу. */
export function isRetryable(err: unknown) {
  if (err instanceof ApiError) return err.status >= 500 || err.status === 429 || err.status === 408;
  // fetch без сети — TypeError, наш таймаут — AbortError/TimeoutError.
  return err instanceof TypeError || (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError"));
}

/** Пауза перед следующей попыткой: растёт до MAX_DELAY_MS; появилась сеть — сразу. */
function pause(attempt: number) {
  const delay = Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, delay);
    window.addEventListener("online", done);
  });
}

async function attempt(entry: OutboxEntry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), ATTEMPT_TIMEOUT_MS);
  try {
    return await sendMessage(entry.chatId, entry.body, entry.channel, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function forget(entry: OutboxEntry) {
  entries.delete(entry.body.clientId);
  void idbDelete(STORE, [entry.body.clientId]);
}

async function deliver(client: QueryClient, entry: OutboxEntry, gen: number) {
  const id = entry.body.clientId;
  for (let n = 0; ; n++) {
    if (gen !== generation || !entries.has(id)) return;
    try {
      const { message } = await attempt(entry);
      if (gen !== generation) return;
      forget(entry);
      historyCache.confirmPending(client, entry.chatId, id, message);
      chatCache.noteMessage(client, entry.chatId, message);
      waiters.get(id)?.resolve(message);
      waiters.delete(id);
      return;
    } catch (err) {
      if (gen !== generation) return;
      if (!isRetryable(err)) {
        forget(entry);
        historyCache.dropPending(client, entry.chatId, id);
        const waiter = waiters.get(id);
        waiters.delete(id);
        // Отправитель ждёт ответа (поле ввода вернёт текст); досылка после перезапуска — тостом.
        if (waiter) waiter.reject(err);
        else toast(`Сообщение не отправлено: ${err instanceof Error ? err.message : "ошибка"}`, { error: true });
        return;
      }
      await pause(n);
    }
  }
}

/** Поставить в очередь своего чата: следующее уйдёт только после предыдущего. */
function schedule(client: QueryClient, entry: OutboxEntry) {
  const gen = generation;
  const prev = queues.get(entry.chatId) ?? Promise.resolve();
  const next = prev.then(() => deliver(client, entry, gen));
  queues.set(entry.chatId, next);
  void next.finally(() => {
    if (queues.get(entry.chatId) === next) queues.delete(entry.chatId);
  });
}

/**
 * Отправить через очередь: пузырь сразу в ленте, запись на устройстве до ответа сервера.
 * Промис — сообщение от сервера; отказ по существу — ошибка (пузырь уже убран).
 */
export function enqueue(client: QueryClient, entry: OutboxEntry): Promise<Message> {
  const id = entry.body.clientId;
  entries.set(id, entry);
  void idbPut(STORE, id, entry);
  historyCache.addPending(client, entry.chatId, entry.pending);
  const result = new Promise<Message>((resolve, reject) => waiters.set(id, { resolve, reject }));
  schedule(client, entry);
  return result;
}

/** Запуск приложения: что не ушло в прошлый раз (закрыли без сети), — снова в ленты и в отправку. */
export async function resumeOutbox(client: QueryClient, userId: string) {
  const gen = generation;
  const stored = await idbEntries<OutboxEntry>(STORE);
  if (gen !== generation) return;
  const mine = stored
    .map(([, e]) => e)
    .filter((e) => e?.userId === userId && typeof e.body?.clientId === "string" && !entries.has(e.body.clientId))
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const entry of mine) {
    entries.set(entry.body.clientId, entry);
    historyCache.addPending(client, entry.chatId, entry.pending);
    schedule(client, entry);
  }
}
