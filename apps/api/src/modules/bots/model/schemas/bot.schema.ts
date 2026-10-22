import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/bots.js.
export const createBotSchema = requestBody({ name: raw(), avatarImage: raw(), description: raw() });
export type CreateBotDto = z.infer<typeof createBotSchema>;

export const broadcastSchema = requestBody({ text: raw() });
export type BroadcastDto = z.infer<typeof broadcastSchema>;

export const patchBotSchema = requestBody({
  name: raw(),
  avatarImage: raw(),
  username: raw(),
  appName: raw(),
  appCode: raw(),
  appUrl: raw(),
  description: raw(),
});
export type PatchBotDto = z.infer<typeof patchBotSchema>;

export const openAppSchema = requestBody({ url: raw(), chatId: raw(), theme: raw() });
export type OpenAppDto = z.infer<typeof openAppSchema>;

export const appDataSchema = requestBody({ data: raw() });
export type AppDataDto = z.infer<typeof appDataSchema>;

export const commandsSchema = requestBody({ commands: raw() });
export type CommandsDto = z.infer<typeof commandsSchema>;
