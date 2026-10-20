// События WebSocket (server/ws.js и broadcastToUsers из маршрутов) — модули
// realtime, звонков и контактов.
import { z } from "zod";
import { call, callWithCaller, signal } from "./calls";
import { chat } from "./chat";
import { isoDate } from "./common";
import { contactUser } from "./contacts";
import { publicUser } from "./user";

/** Ответ на клиентский {"type":"ping"} — ровно эта строка. */
export const pong = z.strictObject({ type: z.literal("pong") });

/** presence:update — при входе lastSeen берётся из профиля (может отсутствовать). */
export const presenceUpdate = z.strictObject({
  type: z.literal("presence:update"),
  userId: z.string(),
  online: z.boolean(),
  lastSeen: isoDate.optional(),
});

export const callIncoming = z.strictObject({ type: z.literal("call:incoming"), call: callWithCaller });
export const callAnswered = z.strictObject({ type: z.literal("call:answered"), callId: z.string() });
export const callUpdated = z.strictObject({ type: z.literal("call:updated"), call });
export const callParticipantsUpdated = z.strictObject({ type: z.literal("call:participants-updated"), call });
export const callSignal = z.strictObject({ type: z.literal("call:signal"), signal });
export const voicechatUpdated = z.strictObject({
  type: z.literal("voicechat:updated"),
  chatId: z.string(),
  call: call.nullable(),
});

/** contact:updated — себе приходит publicUser, остальным — версия с учётом приватности. */
export const contactUpdated = z.strictObject({
  type: z.literal("contact:updated"),
  user: z.union([publicUser, contactUser]),
});

export const chatAdded = z.strictObject({ type: z.literal("chat:added"), chat });
export const chatUpdated = z.strictObject({ type: z.literal("chat:updated"), chat });
