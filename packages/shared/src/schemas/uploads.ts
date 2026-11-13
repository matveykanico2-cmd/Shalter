// Загрузка файлов: server/routes/uploads.js и server/lib/uploadLimits.js.
import { z } from "zod";

export const uploadKind = z.enum(["video", "image", "file", "voice", "video-note", "avatar", "avatar-video", "gift", "profile-track"]);

/** POST /api/uploads — mimeType есть, только если его передали в ?mimeType. */
export const uploadResult = z.strictObject({
  url: z.string().regex(/^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/),
  name: z.string(),
  size: z.number().int().positive(),
  mimeType: z.string().optional(),
  kind: uploadKind,
});

/** GET /api/uploads/limits — лимиты в байтах по видам. */
export const uploadLimits = z.strictObject({
  limits: z.strictObject({
    video: z.number(),
    image: z.number(),
    file: z.number(),
    voice: z.number(),
    "video-note": z.number(),
    avatar: z.number(),
    "avatar-video": z.number(),
    gift: z.number(),
    "profile-track": z.number(),
  }),
  defaultLimit: z.number(),
});

export type UploadResult = z.infer<typeof uploadResult>;

/** Загрузка частями (POST/GET /api/uploads/sessions): сколько байт принято и какими частями слать. */
export const uploadSession = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  received: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
});

/** PUT /api/uploads/sessions/:id — часть принята. */
export const uploadSessionChunk = z.strictObject({ id: z.string(), received: z.number().int().nonnegative(), size: z.number().int().positive() });
