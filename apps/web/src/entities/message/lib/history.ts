// Слияние ленты чата — как refreshMessages, loadOlder, applyLive и sendOne в
// public/js/views/chatView.js. Чистые функции над History: их вызывают запрос истории,
// события сокета и отправка.
import type { FeedMessage, History, HistoryPage, Message } from "../model/types";

export const emptyHistory = (): History => ({ messages: [], hasMore: false, firstUnreadId: null, replyTargets: {}, unconfirmed: [] });

/**
 * Свежая последняя страница поверх того, что уже было: история старше неё остаётся,
 * временные пузыри и ещё не подтверждённые сервером сообщения — тоже.
 */
export function mergeLatest(prev: History | undefined, page: HistoryPage): History {
  const fresh: FeedMessage[] = page.messages;
  const replyTargets = { ...prev?.replyTargets, ...page.replyTargets };
  if (!prev) return { messages: fresh, hasMore: page.hasMore, firstUnreadId: page.firstUnreadId, replyTargets, unconfirmed: [] };

  const freshIds = new Set(fresh.map((m) => m.id));
  const unconfirmed = prev.unconfirmed.filter((id) => !freshIds.has(id));
  // Пустой ответ — чат очищен; остаются только свои ещё не подтверждённые сообщения.
  if (!fresh.length && !unconfirmed.length && !prev.messages.some((m) => m.pending)) {
    return { messages: [], hasMore: page.hasMore, firstUnreadId: page.firstUnreadId, replyTargets, unconfirmed };
  }
  const waiting = new Set(unconfirmed);
  const cutoff = fresh[0]?.createdAt;
  const older = prev.messages.filter((m) => !m.pending && (cutoff ? m.createdAt < cutoff : !freshIds.has(m.id)));
  const notYetListed = prev.messages.filter((m) => waiting.has(m.id) && !freshIds.has(m.id) && (!cutoff || m.createdAt >= cutoff));
  const stillPending = prev.messages.filter((m) => m.pending);
  return {
    messages: [...older, ...fresh, ...notYetListed, ...stillPending],
    hasMore: older.length ? prev.hasMore : page.hasMore,
    firstUnreadId: page.firstUnreadId,
    replyTargets,
    unconfirmed,
  };
}

/** Страница истории раньше первой загруженной. */
export function prependOlder(prev: History, page: HistoryPage): History {
  const known = new Set(prev.messages.map((m) => m.id));
  return {
    ...prev,
    messages: [...page.messages.filter((m) => !known.has(m.id)), ...prev.messages],
    hasMore: page.hasMore,
    replyTargets: { ...prev.replyTargets, ...page.replyTargets },
  };
}

/** Чужое сообщение из события сокета показываем сразу, не дожидаясь запроса. */
export function canApplyLive(m: Message, chatId: string, meId: string) {
  return !!m.id && !m.threadRootId && m.chatId === chatId && m.senderId !== meId;
}

/**
 * Сообщение из события: есть в ленте — заменяем, нет и insert — добавляем в конец
 * (если оно не старее последнего). null — применить нельзя, нужен перезапрос.
 */
export function applyLive(prev: History, m: Message, insert: boolean): History | null {
  const i = prev.messages.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    // Событие несёт сообщение целиком: нет keyboard — бот убрал клавиатуру.
    const merged: FeedMessage = { ...prev.messages[i], ...m };
    if (!("keyboard" in m)) delete merged.keyboard;
    return { ...prev, messages: prev.messages.map((x, j) => (j === i ? merged : x)) };
  }
  if (!insert) return null;
  const last = prev.messages.findLast((x) => !x.pending);
  if (last && m.createdAt < last.createdAt) return null;
  const pending = prev.messages.filter((x) => x.pending);
  const settled = prev.messages.filter((x) => !x.pending);
  return { ...prev, messages: [...settled, m, ...pending], unconfirmed: [...prev.unconfirmed, m.id] };
}

export function removeMessage(prev: History, id: string): History {
  if (!prev.messages.some((m) => m.id === id)) return prev;
  return { ...prev, messages: prev.messages.filter((m) => m.id !== id), unconfirmed: prev.unconfirmed.filter((x) => x !== id) };
}

/** message:read — читатель видел эти сообщения (в личке приходит и время). */
export function markRead(prev: History, readerId: string, ids: readonly string[], readAt?: string): History {
  const wanted = new Set(ids);
  let changed = false;
  const messages = prev.messages.map((m) => {
    if (!wanted.has(m.id) || m.readByIds.includes(readerId)) return m;
    changed = true;
    return { ...m, readByIds: [...m.readByIds, readerId], ...(readAt && !m.readAt ? { readAt } : {}) };
  });
  return changed ? { ...prev, messages } : prev;
}

export function addPending(prev: History, m: FeedMessage): History {
  return { ...prev, messages: [...prev.messages, { ...m, pending: true }] };
}

/**
 * Сервер принял отправку. Пока ждали ответа, сообщение могло прийти перезапросом —
 * тогда временный пузырь просто убираем, а не превращаем во второй такой же.
 */
export function confirmPending(prev: History, localId: string, m: Message): History {
  const unconfirmed = prev.unconfirmed.includes(m.id) ? prev.unconfirmed : [...prev.unconfirmed, m.id];
  if (prev.messages.some((x) => x.id === m.id)) return { ...prev, messages: prev.messages.filter((x) => x.id !== localId), unconfirmed };
  if (prev.messages.some((x) => x.id === localId)) return { ...prev, messages: prev.messages.map((x) => (x.id === localId ? m : x)), unconfirmed };
  return { ...prev, messages: [...prev.messages, m], unconfirmed };
}

export const dropPending = (prev: History, localId: string): History => removeMessage(prev, localId);
