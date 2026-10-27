// Опрос и чек-лист во вложении — PollAttachment, ChecklistAttachment и applyLocalVote
// из public/js/components/messageBubble.js и views/chatView.js.
import type { Attachment } from "../model/attachment";

export type PollMeta = {
  options: string[];
  votes?: number[];
  voterIds?: string[][];
  correctIndex?: number | null;
  multiple?: boolean;
  closed?: boolean;
};

export type ChecklistItem = { id: number; text: string; doneBy?: string; doneAt?: string };
export type ChecklistMeta = { items: ChecklistItem[]; othersCanAdd?: boolean; othersCanMark?: boolean };

export const pollMeta = (a: Attachment) => (a.meta ?? { options: [] }) as PollMeta;
export const checklistMeta = (a: Attachment) => (a.meta ?? { items: [] }) as ChecklistMeta;

/** Всё, что нужно нарисовать опрос: проценты, свои голоса, викторина, итоги. */
export function pollView(meta: PollMeta, meId: string) {
  const options = meta.options ?? [];
  const voterIds = meta.voterIds ?? options.map(() => []);
  const votes = meta.votes ?? voterIds.map((v) => v.length);
  const totalVoters = new Set(voterIds.flat()).size;
  const myVotes = voterIds.flatMap((ids, i) => (ids.includes(meId) ? [i] : []));
  const correctIndex = Number.isInteger(meta.correctIndex) ? (meta.correctIndex as number) : null;
  const isQuiz = correctIndex !== null;
  const multiple = !!meta.multiple && !isQuiz;
  const closed = !!meta.closed;
  const answered = myVotes.length > 0;
  const maxVotes = Math.max(0, ...votes);
  return {
    options: options.map((text, i) => ({
      text,
      pct: Math.round(((votes[i] ?? 0) / (totalVoters || 1)) * 100),
      mine: myVotes.includes(i),
      leader: (votes[i] ?? 0) > 0 && votes[i] === maxVotes,
      mark: !isQuiz || !answered ? null : i === correctIndex ? ("correct" as const) : i === myVotes[0] ? ("wrong" as const) : null,
    })),
    totalVoters,
    isQuiz,
    multiple,
    closed,
    answered,
    showResults: answered || closed,
    correctText: correctIndex !== null ? (options[correctIndex] ?? "") : null,
    gotIt: isQuiz && answered && myVotes[0] === correctIndex,
    kindLabel: closed ? "Опрос завершён" : isQuiz ? "Викторина" : multiple ? "Несколько ответов" : "Опрос",
    canVote: !closed && !(isQuiz && answered) && !(!multiple && answered),
  };
}

/** Свой голос сразу, до ответа сервера; null — снять все свои голоса. */
export function applyVote(meta: PollMeta, optionIndex: number | null, meId: string): PollMeta {
  if (meta.closed) return meta;
  const multiple = !!meta.multiple && !Number.isInteger(meta.correctIndex);
  const voterIds = (meta.voterIds ?? meta.options.map(() => [])).map((ids) => [...(ids ?? [])]);
  if (optionIndex === null) {
    for (let i = 0; i < voterIds.length; i++) voterIds[i] = voterIds[i]!.filter((v) => v !== meId);
  } else if (multiple) {
    const ids = voterIds[optionIndex]!;
    voterIds[optionIndex] = ids.includes(meId) ? ids.filter((v) => v !== meId) : [...ids, meId];
  } else {
    for (let i = 0; i < voterIds.length; i++) voterIds[i] = voterIds[i]!.filter((v) => v !== meId);
    voterIds[optionIndex]!.push(meId);
  }
  return { ...meta, voterIds, votes: voterIds.map((v) => v.length) };
}

/** Отметить пункт или снять отметку. */
export function toggleChecklistItem(meta: ChecklistMeta, itemId: number, meId: string, now = new Date().toISOString()): ChecklistMeta {
  return {
    ...meta,
    items: meta.items.map((it) => {
      if (it.id !== itemId) return it;
      if (it.doneBy) return { id: it.id, text: it.text };
      return { ...it, doneBy: meId, doneAt: now };
    }),
  };
}

/** Заменить meta вложения такого вида (первого) — для своих правок до ответа сервера. */
export function withAttachmentMeta<T extends { attachments?: unknown[] }>(m: T, kind: string, fn: (meta: never) => unknown): T {
  let done = false;
  const attachments = (m.attachments ?? []).map((raw) => {
    const a = raw as Attachment;
    if (done || a.kind !== kind) return raw;
    done = true;
    return { ...a, meta: fn(a.meta as never) };
  });
  return { ...m, attachments };
}
