import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Маршруты чатов смотрят на тип и наличие полей сами (`typeof x === "string"`, `"x" in body`,
// `!!x`) и отвечают своими текстами ошибок, поэтому поля приходят как есть.

export const pinnedOrderSchema = requestBody({ chatIds: raw() });
export type PinnedOrderDto = z.infer<typeof pinnedOrderSchema>;

export const createDmSchema = requestBody({ userId: raw(), title: raw(), avatarColor: raw() });
export type CreateDmDto = z.infer<typeof createDmSchema>;

export const createSecretSchema = requestBody({ userId: raw() });
export type CreateSecretDto = z.infer<typeof createSecretSchema>;

export const createCommunitySchema = requestBody({
  title: raw(),
  avatarImage: raw(),
  memberIds: raw(),
  adminIds: raw(),
  description: raw(),
  username: raw(),
  isPublic: raw(),
});
export type CreateCommunityDto = z.infer<typeof createCommunitySchema>;

export const patchChatSchema = requestBody({
  title: raw(),
  description: raw(),
  avatarImage: raw(),
  avatarColor: raw(),
  autoDeleteSeconds: raw(),
  pinned: raw(),
  archived: raw(),
  muted: raw(),
  unread: raw(),
});
export type PatchChatDto = z.infer<typeof patchChatSchema>;

export const deleteChatSchema = requestBody({ reason: raw() });
export type DeleteChatDto = z.infer<typeof deleteChatSchema>;

export const clearSchema = requestBody({ forEveryone: raw() });
export type ClearDto = z.infer<typeof clearSchema>;

export const wallpaperSchema = requestBody({ wallpaper: raw(), forEveryone: raw(), label: raw() });
export type WallpaperDto = z.infer<typeof wallpaperSchema>;

export const draftSchema = requestBody({ text: raw() });
export type DraftDto = z.infer<typeof draftSchema>;

export const muteSchema = requestBody({ hours: raw(), forever: raw(), off: raw() });
export type MuteDto = z.infer<typeof muteSchema>;

export const typingSchema = requestBody({ action: raw() });
export type TypingDto = z.infer<typeof typingSchema>;

export const protectSchema = requestBody({ enabled: raw() });
export type ProtectDto = z.infer<typeof protectSchema>;

export const limitQuerySchema = requestQuery({ limit: raw() });
export type LimitQueryDto = z.infer<typeof limitQuerySchema>;
