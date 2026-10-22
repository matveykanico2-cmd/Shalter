import type { Attachment } from "../../../legacy/legacy.js";
import type { Message } from "../model/domain.js";

// Правки сообщения для MessagesRepository.mutate — та же логика, что у одноимённых функций
// server/data/messages.js (там она внутри слоя данных). message.mapper.spec.ts сверяет итог.
// Каждая функция возвращает новое сообщение, не меняя переданное.

export const editText = (m: Message, text: string): Message => ({ ...m, text, editedAt: new Date().toISOString() });

export const setPinned = (m: Message, pinned: unknown): Message => ({ ...m, pinned: pinned as boolean });

export const setLinkPreview = (m: Message, linkPreview: unknown): Message => ({ ...m, linkPreview });

export const incrementCommentCount = (m: Message): Message => ({ ...m, commentCount: (m.commentCount ?? 0) + 1 });

export const setReportStatus = (status: string) => (m: Message): Message =>
  m.report ? { ...m, report: { ...(m.report as object), status } } : m;

export const incrementViews = (m: Message): Message => ({ ...m, views: (m.views ?? 0) + 1 });

/** Превью вложения готово (фоновый процесс): поля превью поверх вложения, без previewPending. */
export const setAttachmentPreview = (index: number, preview: Record<string, unknown> | null | undefined) => (m: Message): Message => ({
  ...m,
  attachments: m.attachments?.map((a, i) => {
    if (i !== index) return a;
    const next: Attachment = { ...a, previewPending: undefined };
    for (const [key, value] of Object.entries(preview ?? {})) {
      if (value !== undefined && value !== null) next[key] = value;
    }
    return next;
  }),
});

export const setAnchorForPost = (postId: string) => (m: Message): Message => ({ ...m, anchorForPostId: postId });

export const setDiscussionAnchor = (anchorId: string) => (m: Message): Message => ({ ...m, discussionAnchorId: anchorId });

export function deleteForUser(m: Message, userId: string): Message {
  const ids = new Set(m.deletedForIds ?? []);
  ids.add(userId);
  return { ...m, deletedForIds: [...ids] };
}

/** Реакция переключается; сверх maxPerUser снимается самая старая своя. */
export function toggleReaction(m: Message, emoji: string, userId: string, maxPerUser: number): Message {
  const reactions = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
  const dropOldest = () => {
    const mine = reactions.filter((r) => r.userIds.includes(userId));
    while (mine.length >= maxPerUser) {
      const oldest = mine.shift()!;
      oldest.userIds = oldest.userIds.filter((u) => u !== userId);
    }
  };
  const existing = reactions.find((r) => r.emoji === emoji);
  if (existing) {
    if (existing.userIds.includes(userId)) {
      existing.userIds = existing.userIds.filter((u) => u !== userId);
    } else {
      dropOldest();
      existing.userIds.push(userId);
    }
  } else {
    dropOldest();
    reactions.push({ emoji, userIds: [userId] });
  }
  return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
}

/** Эмодзи реакции после очистки; пустое — реакции нет (как в server/data/messages.js). */
export const cleanReaction = (emoji: unknown): string => (typeof emoji === "string" ? emoji.trim().slice(0, 40) : "");

/**
 * Голос в опросе. Один вариант: повтор того же снимает голос, другой — переносит.
 * Несколько ответов — варианты независимы. Викторина — голос один раз.
 */
export function votePoll(m: Message, optionIndex: unknown, userId: string): Message {
  const attachments = m.attachments?.map((a) => {
    if (a.kind !== "poll") return a;
    if (a.meta?.closed) return a;
    const options: unknown[] = a.meta?.options ?? [];
    if (!Number.isInteger(optionIndex) || (optionIndex as number) < 0 || (optionIndex as number) >= options.length) return a;
    const index = optionIndex as number;
    const voterIds: string[][] = options.map((_, i) => [...(a.meta?.voterIds?.[i] ?? [])]);
    const isQuiz = Number.isInteger(a.meta?.correctIndex);
    if (isQuiz && voterIds.some((ids) => ids.includes(userId))) return a;
    if (a.meta?.multiple && !isQuiz) {
      voterIds[index] = voterIds[index]!.includes(userId) ? voterIds[index]!.filter((v) => v !== userId) : [...voterIds[index]!, userId];
    } else {
      let votedSameAgain = false;
      for (let i = 0; i < voterIds.length; i++) {
        if (voterIds[i]!.includes(userId)) {
          if (i === index) votedSameAgain = true;
          voterIds[i] = voterIds[i]!.filter((v) => v !== userId);
        }
      }
      if (!votedSameAgain) voterIds[index]!.push(userId);
    }
    return { ...a, meta: { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) } };
  });
  return { ...m, attachments };
}

/** Отзыв голоса; в закрытом опросе и викторине — без изменений. */
export function retractPollVote(m: Message, userId: string): Message {
  const attachments = m.attachments?.map((a) => {
    if (a.kind !== "poll" || a.meta?.closed || Number.isInteger(a.meta?.correctIndex)) return a;
    const voterIds = ((a.meta?.voterIds ?? []) as (string[] | null)[]).map((ids) => (ids ?? []).filter((v) => v !== userId));
    return { ...a, meta: { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) } };
  });
  return { ...m, attachments };
}

export const closePoll = (m: Message): Message => ({
  ...m,
  attachments: m.attachments?.map((a) => (a.kind === "poll" ? { ...a, meta: { ...a.meta, closed: true } } : a)),
});

interface ChecklistItem {
  id: number;
  text: string;
  doneBy?: string;
  doneAt?: string;
}

/** Отметка пункта чек-листа: отмеченный — снимается, иначе — отмечается этим пользователем. */
export const toggleChecklistItem = (m: Message, itemId: number, userId: string): Message => ({
  ...m,
  attachments: m.attachments?.map((a) => {
    if (a.kind !== "checklist") return a;
    const items = ((a.meta?.items ?? []) as ChecklistItem[]).map((it) => {
      if (it.id !== itemId) return it;
      if (it.doneBy) {
        const { doneBy: _doneBy, doneAt: _doneAt, ...rest } = it;
        return rest;
      }
      return { ...it, doneBy: userId, doneAt: new Date().toISOString() };
    });
    return { ...a, meta: { ...a.meta, items } };
  }),
});

/** Новые пункты чек-листа, пока их не больше max. */
export const addChecklistItems = (m: Message, texts: string[], max: number): Message => ({
  ...m,
  attachments: m.attachments?.map((a) => {
    if (a.kind !== "checklist") return a;
    const items = [...((a.meta?.items ?? []) as ChecklistItem[])];
    let nextId = Math.max(0, ...items.map((it) => it.id)) + 1;
    for (const text of texts) {
      if (items.length >= max) break;
      items.push({ id: nextId++, text });
    }
    return { ...a, meta: { ...a.meta, items } };
  }),
});

/** Новая точка живой геолокации — только от автора и пока трансляция не истекла. */
export function updateLiveLocation(m: Message, senderId: string, lat: number, lng: number): Message {
  if (m.senderId !== senderId) return m;
  const nowIso = new Date().toISOString();
  const attachments = m.attachments?.map((a) => {
    if (a.kind !== "location" || !a.meta?.live) return a;
    if (a.meta.expiresAt && a.meta.expiresAt <= nowIso) return a;
    return { ...a, meta: { ...a.meta, lat, lng } };
  });
  return { ...m, attachments };
}
