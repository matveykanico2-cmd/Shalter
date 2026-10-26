import type { Story, StoryGroup, StoryItem } from "../api/story-queries";

/** Кадр просмотра: история из нескольких фото/видео листается по элементам. */
export type StoryFrame = { story: Story; item: StoryItem; index: number };

/** Кадры группы по порядку; у старых одноэлементных историй items может не быть. */
export function framesOf(group: StoryGroup | undefined): StoryFrame[] {
  if (!group) return [];
  return group.stories.flatMap((story) =>
    (story.items?.length ? story.items : [{ kind: story.kind, url: story.url }]).map((item, index) => ({ story: story as Story, item, index }))
  );
}

/** Есть непросмотренные — кольцо цветное. */
export const hasUnseen = (group: StoryGroup) => group.stories.some((s) => !s.viewed);

/** «3 истории» — storyWord в public/js/components/profileDialog.js. */
export function storyWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "история";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "истории";
  return "историй";
}

/** Дата под кадром архива: «12 окт.», в прошлом году — с годом (storyDate в profileDialog.js). */
export function storyDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}
