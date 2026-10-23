export { hasAnimatedEmoji } from "@/shared/lib/anim";

// Реакции, которые только что поставили (своей рукой), — их анимация проигрывается.
const recent = new Map<string, number>();
const RECENT_MS = 4000;

export function noteReacted(messageId: string, emoji: string) {
  recent.set(`${messageId}|${emoji}`, Date.now());
}

export function justReacted(messageId: string, emoji: string) {
  const t = recent.get(`${messageId}|${emoji}`);
  return !!t && Date.now() - t < RECENT_MS;
}
