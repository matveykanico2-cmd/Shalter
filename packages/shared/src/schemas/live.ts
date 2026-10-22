// Прямые эфиры: /api/live (server/routes/live.js, rowToStream/rowToParticipant
// в server/data/liveStreams.js). id эфиров и сообщений — не genId: live_<ms>_<хвост>, lm_<ms>_<хвост>.
import { z } from "zod";
import { isoDate } from "./common";
import { publicUser } from "./user";

export const liveStreamId = z.string().regex(/^live_\d+_[a-z0-9]+$/);
export const liveMessageId = z.string().regex(/^lm_\d+_[a-z0-9]+$/);

export const liveStream = z.strictObject({
  id: liveStreamId,
  chatId: z.string(),
  hostId: z.string(),
  title: z.string(),
  withVideo: z.boolean(),
  source: z.enum(["webrtc", "rtmp"]),
  rtmpLive: z.boolean(),
  status: z.enum(["live", "ended"]),
  startedAt: isoDate,
  endedAt: isoDate.nullable(),
});

/** Адрес приёма для OBS — только ведущему RTMP-эфира, остальным null. */
export const liveIngest = z.strictObject({ url: z.string().regex(/^rtmp:\/\/[^/]+:\d+\/live$/), key: z.string().regex(/^[a-f0-9]{32}$/) }).nullable();

/** Если пользователя нет в базе, вместо карточки приходит { id, name: "—" }. */
const liveUser = publicUser.or(z.strictObject({ id: z.string(), name: z.literal("—") }));

export const liveParticipant = z.strictObject({
  userId: z.string(),
  role: z.enum(["host", "speaker", "viewer"]),
  handRaised: z.boolean(),
  mutedByHost: z.boolean(),
  joinedAt: isoDate,
  user: liveUser,
});

export const liveMessage = z.strictObject({
  id: liveMessageId,
  text: z.string(),
  createdAt: isoDate,
  editedAt: isoDate.optional(),
  user: liveUser,
});

/** POST / */
export const liveCreateBody = z.strictObject({ stream: liveStream, already: z.literal(true).optional(), ingest: liveIngest });

/** GET /chat/:chatId */
export const liveChatBody = z.union([
  z.strictObject({ stream: z.null(), viewers: z.literal(0), canHost: z.boolean() }),
  z.strictObject({ stream: liveStream, viewers: z.number(), canHost: z.boolean(), canStop: z.boolean() }),
]);

/** GET /:id и POST /:id/join — состояние эфира (stateOf) + ingest. */
export const liveStateBody = z.strictObject({
  stream: liveStream,
  participants: z.array(liveParticipant),
  messages: z.array(liveMessage),
  ingest: liveIngest,
});

export const liveLeaveBody = z.strictObject({ ok: z.literal(true), ended: z.literal(true).optional() });
export const liveStopBody = z.strictObject({ stream: liveStream });
/** POST /:id/messages — без editedAt; PATCH — с editedAt. */
export const liveMessageBody = z.strictObject({ message: liveMessage });
