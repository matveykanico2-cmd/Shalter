import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяют сервисы — со своими текстами ошибок, как server/routes/avatars.js,
// profileStatus.js и profileTrack.js.

export const addAvatarSchema = requestBody({ url: raw(), kind: raw(), poster: raw() });
export type AddAvatarDto = z.infer<typeof addAvatarSchema>;

export const addStatusSchema = requestBody({ catalogId: raw(), image: raw(), name: raw() });
export type AddStatusDto = z.infer<typeof addStatusSchema>;

export const activeStatusSchema = requestBody({ id: raw() });
export type ActiveStatusDto = z.infer<typeof activeStatusSchema>;

export const addTrackSchema = requestBody({ url: raw(), name: raw(), size: raw(), mimeType: raw(), duration: raw() });
export type AddTrackDto = z.infer<typeof addTrackSchema>;
