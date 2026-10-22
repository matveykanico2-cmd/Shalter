import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисах, как в server/routes/communities.js.
export const createCommunitySchema = requestBody({
  title: raw(),
  description: raw(),
  avatarColor: raw(),
  avatarImage: raw(),
  addMode: raw(),
  chatId: raw(),
  chatVisible: raw(),
});
export type CreateCommunityDto = z.infer<typeof createCommunitySchema>;

export const patchCommunitySchema = requestBody({ title: raw(), description: raw(), avatarImage: raw(), addMode: raw() });
export type PatchCommunityDto = z.infer<typeof patchCommunitySchema>;

export const prefsSchema = requestBody({ pinned: raw(), collapsed: raw() });
export type PrefsDto = z.infer<typeof prefsSchema>;

export const muteSchema = requestBody({ hours: raw(), forever: raw(), off: raw() });
export type MuteDto = z.infer<typeof muteSchema>;

export const membersQuerySchema = requestQuery({ q: raw() });
export type MembersQuery = z.infer<typeof membersQuerySchema>;

export const addChatSchema = requestBody({ chatId: raw(), visible: raw() });
export type AddChatDto = z.infer<typeof addChatSchema>;

export const chatVisibleSchema = requestBody({ visible: raw() });
export type ChatVisibleDto = z.infer<typeof chatVisibleSchema>;

export const decideRequestSchema = requestBody({ approve: raw() });
export type DecideRequestDto = z.infer<typeof decideRequestSchema>;

export const adminRightsSchema = requestBody({ rights: raw() });
export type AdminRightsDto = z.infer<typeof adminRightsSchema>;
