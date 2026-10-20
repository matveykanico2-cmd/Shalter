// Звонки: rowToCall (server/data/calls.js), сигналы WebRTC (server/data/signals.js)
// и обёртки маршрутов server/routes/calls.js (withCaller, список звонков).
import { z } from "zod";
import { anyJson, genId, isoDate } from "./common";
import { viewerUser } from "./user";

export const callStatus = z.enum(["ongoing", "ended", "missed", "completed", "declined"]);

const callShape = {
  id: genId("cl"),
  chatId: z.string(),
  // Вид звонка сервер не проверяет — хранится то, что прислал клиент
  // ("voice" / "video"), голосовой чат группы — "voice-room".
  kind: z.string(),
  // В базе всегда "outgoing" (direction ?? undefined); список звонков подменяет на свою.
  direction: z.literal("outgoing").optional(),
  callerId: z.string(),
  status: callStatus,
  startedAt: isoDate,
  durationSec: z.number().int().nonnegative(),
  participantIds: z.array(z.string()),
  // Появляется после POST /:id/invite-link: 16 случайных байт в hex.
  joinToken: z.string().regex(/^[0-9a-f]{32}$/).optional(),
};

export const call = z.strictObject(callShape);

/** call:incoming — звонок плюс профиль звонящего глазами получателя (withCaller → publicUserFor). */
export const callWithCaller = z.strictObject({ ...callShape, otherUser: viewerUser.optional() });

/** Элемент GET /api/calls. */
export const callListItem = z.strictObject({
  ...callShape,
  direction: z.enum(["outgoing", "incoming"]),
  otherUser: viewerUser.nullable(),
  group: z
    .strictObject({
      title: z.string().nullable(),
      avatarColor: z.string().optional(),
      avatarImage: z.string().optional(),
    })
    .nullable(),
});

/** Сигнал WebRTC: id вида sig_<ms>_<seq>, seq растёт монотонно на весь сервер. */
export const signal = z.strictObject({
  id: z.string().regex(/^sig_\d+_\d+$/),
  seq: z.number().int().positive(),
  callId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  kind: z.string(),
  // При отправке без data ключа нет; из базы (поллинг) отсутствие — null.
  data: anyJson.optional(),
  createdAt: isoDate,
});

export const iceServer = z.strictObject({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export const callBody = z.strictObject({ call });
export type Call = z.infer<typeof call>;
export type Signal = z.infer<typeof signal>;
