import { z } from "zod";
import { requestBody, text } from "../../../../common/lib/zod.js";
import { isSafeUrl } from "../../../../legacy/legacy.js";
import type { StoryItem } from "../domain.js";

// Как server/routes/stories.js.
const MAX_ITEMS = 10;
const MAX_META_BYTES = 32_000;

function safeMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const json = JSON.stringify(value);
    return json.length <= MAX_META_BYTES ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Кадры истории: items, а без него — один кадр из kind и url; неподходящие отбрасываются. */
const storyItems = requestBody({ kind: z.unknown().optional(), url: z.unknown().optional(), meta: z.unknown().optional(), items: z.unknown().optional() }).transform(({ kind, url, meta, items }): StoryItem[] => {
  const rawItems: any[] = Array.isArray(items) && items.length ? items : [{ kind, url, meta }];
  return rawItems
    .slice(0, MAX_ITEMS)
    .filter((it) => {
      if (!it || typeof it.kind !== "string") return false;
      if (["image", "video"].includes(it.kind)) return !!it.url && isSafeUrl(it.url);
      return ["poll", "checklist", "contact", "location", "game", "dice"].includes(it.kind) && !!safeMeta(it.meta);
    })
    .map((it) => ({
      kind: it.kind,
      url: typeof it.url === "string" ? it.url : "",
      ...(safeMeta(it.meta) ? { meta: safeMeta(it.meta) } : {}),
      ...(typeof it.audioUrl === "string" && isSafeUrl(it.audioUrl) ? { audioUrl: it.audioUrl } : {}),
    }));
});

/** Своя история: пустая отклоняется сразу — раньше неё в server/ ничего не проверяется. */
export const createStorySchema = storyItems
  .refine((items) => items.length > 0, { error: "invalid story" })
  .transform((items) => ({ items }));
export type CreateStoryDto = z.infer<typeof createStorySchema>;

/** История канала: пустую отклоняет сервис — после проверки канала и прав. */
export const createChannelStorySchema = storyItems.transform((items) => ({ items }));
export type CreateChannelStoryDto = z.infer<typeof createChannelStorySchema>;

export const storyAttachmentActionSchema = requestBody({
  itemIndex: z.number().int().min(0).max(MAX_ITEMS - 1),
  action: z.enum(["vote", "toggle"]),
  optionIndex: z.number().int().min(0).max(19).optional(),
});
export type StoryAttachmentActionDto = z.infer<typeof storyAttachmentActionSchema>;

// Пустой текст отклоняет сервис: сначала проверяется, что история видна (404).
const commentText = () => text().transform((v) => v.trim().slice(0, 500));

export const storyCommentSchema = requestBody({
  text: commentText(),
  parentId: z.unknown().optional().transform((v) => (v ? String(v) : null)),
});
export type StoryCommentDto = z.infer<typeof storyCommentSchema>;

export const editStoryCommentSchema = requestBody({ text: commentText() });
export type EditStoryCommentDto = z.infer<typeof editStoryCommentSchema>;
