import type { Story, StoryComment, StoryCommentRow, StoryItem, StoryRow } from "../model/domain.js";

// Строки stories и story_comments → объекты API, как rowToStory и rowToComment в server/data/stories.js.

/** История живёт сутки. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const parseIds = (value: string | null | undefined): string[] => {
  try {
    return JSON.parse(value ?? "[]");
  } catch {
    return [];
  }
};

/** Элементы истории; у старых строк items нет — тогда один элемент из kind и url. */
export function itemsOf(row: Pick<StoryRow, "items" | "kind" | "url">): StoryItem[] {
  try {
    const parsed = row.items ? JSON.parse(row.items) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // битый JSON — как старая строка
  }
  return [{ kind: row.kind, url: row.url }];
}

export function toStory(row: StoryRow): Story {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    url: row.url,
    items: itemsOf(row),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    viewedByIds: parseIds(row.viewedByIds),
    likedByIds: parseIds(row.likedByIds),
  };
}

export function toStoryComment(row: StoryCommentRow): StoryComment {
  const likedByIds = parseIds(row.likedByIds);
  return {
    id: row.id,
    storyId: row.storyId,
    userId: row.userId,
    text: row.text,
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? undefined,
    parentId: row.parentId ?? null,
    likedByIds,
    likeCount: likedByIds.length,
  };
}

/** Добавляет id, а если он уже есть — убирает (лайк/снятие лайка). */
export function toggleId(ids: string[], id: string): string[] {
  const next = [...ids];
  const index = next.indexOf(id);
  if (index === -1) next.push(id);
  else next.splice(index, 1);
  return next;
}
