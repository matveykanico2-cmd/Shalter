// Реакции на сообщении — как toggleReaction в server/data/messages.js: та же раскладка,
// чтобы своя реакция встала в пузырь сразу и ответ сервера её не «передвинул».
import type { Message } from "../model/types";

export type Reaction = { emoji: string; userIds: string[] };

/** Быстрые реакции в меню сообщения; Premium — ещё ряд (public/js/components/messageBubble.js). */
export const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"] as const;
export const PREMIUM_REACTIONS = ["💎", "👑", "🚀", "🥂", "💯", "🌟"] as const;

/** Без Premium у человека одна реакция на сообщение, с Premium — до трёх. */
export const maxReactionsPerUser = (isPremium: boolean) => (isPremium ? 3 : 1);

export const reactionsOf = (m: Pick<Message, "reactions">) => m.reactions as Reaction[];

/** Поставить или снять реакцию; сверх лимита снимается самая ранняя своя. */
export function toggleReaction(list: readonly Reaction[], emoji: string, userId: string, max: number): Reaction[] {
  const reactions = list.map((r) => ({ ...r, userIds: [...r.userIds] }));
  const existing = reactions.find((r) => r.emoji === emoji);
  if (existing?.userIds.includes(userId)) {
    existing.userIds = existing.userIds.filter((u) => u !== userId);
  } else {
    const mine = reactions.filter((r) => r.userIds.includes(userId));
    while (mine.length >= max) {
      const oldest = mine.shift()!;
      oldest.userIds = oldest.userIds.filter((u) => u !== userId);
    }
    if (existing) existing.userIds.push(userId);
    else reactions.push({ emoji, userIds: [userId] });
  }
  return reactions.filter((r) => r.userIds.length > 0);
}

/** Что из быстрых реакций уже стоит от этого человека. */
export const chosenReactions = (m: Pick<Message, "reactions">, userId: string) =>
  new Set(reactionsOf(m).filter((r) => r.userIds.includes(userId)).map((r) => r.emoji));
