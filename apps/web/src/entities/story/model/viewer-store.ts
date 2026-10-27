import { useSyncExternalStore } from "react";

import type { StoryGroup } from "../api/story-queries";

// Открытый просмотр историй — как openStoryViewer(groups, groupIndex, meId, onChanged, startIndex)
// в public/js/components/storyViewer.js: открыть можно из полосы историй и из профиля, а сам
// просмотр один на всё приложение — его рисует StoryViewerHost (features/stories) в оболочке.
export type StoryViewerRequest = {
  id: number;
  groups: StoryGroup[];
  groupIndex: number;
  /** С какого кадра группы начать (сетка историй в профиле). */
  startIndex: number;
  /** Что-то поменялось (просмотрена, удалена) — перечитать своё. Ленту и профиль просмотр обновляет сам. */
  onChanged?: () => void;
};

let current: StoryViewerRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openStoryViewer(groups: StoryGroup[], groupIndex = 0, { startIndex = 0, onChanged }: { startIndex?: number; onChanged?: () => void } = {}) {
  if (!groups[groupIndex]) return;
  current = { id: ++seq, groups, groupIndex, startIndex: Math.max(0, startIndex), onChanged };
  emit();
}

export function closeStoryViewer() {
  if (current === null) return;
  current = null;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Что открыто в просмотре историй, или null. */
export const useStoryViewerRequest = () => useSyncExternalStore(subscribe, () => current);
