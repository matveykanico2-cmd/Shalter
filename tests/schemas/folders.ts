// Папки чатов: rowToFolder (server/data/folders.js) и приглашение в папку
// (server/routes/folders.js).
import { z } from "zod";
import { genId } from "./common";

export const folder = z.strictObject({
  id: genId("f"),
  ownerId: z.string(),
  name: z.string(),
  order: z.number().int(),
  chatIds: z.array(z.string()),
  // Только пока есть ссылка-приглашение: 8 случайных байт в hex.
  inviteCode: z.string().regex(/^[0-9a-f]{16}$/).optional(),
});

/** GET /api/folders/invite/:code — название и публичные чаты папки (без участников). */
export const folderInvite = z.strictObject({
  name: z.string(),
  chats: z.array(
    z.strictObject({
      id: z.string(),
      type: z.enum(["group", "channel", "dm", "bot"]),
      title: z.string().nullable(),
      username: z.string().optional(),
      avatarColor: z.string().optional(),
      avatarImage: z.string().optional(),
    })
  ),
});

export const folderBody = z.strictObject({ folder });
