import type { liveMessages, liveParticipants, liveStreams } from "../../db/schema.js";

export type LiveStreamRow = typeof liveStreams.$inferSelect;
export type LiveParticipantRow = typeof liveParticipants.$inferSelect;
/** Сообщение чата эфира — строка таблицы как есть (getMessage в server/data/liveStreams.js). */
export type LiveMessageRow = typeof liveMessages.$inferSelect;

/** Эфир в ответах API — rowToStream в server/data/liveStreams.js. */
export interface LiveStream {
  id: string;
  chatId: string;
  hostId: string;
  title: string;
  withVideo: boolean;
  /** webrtc — из приложения, rtmp — из OBS. */
  source: string;
  rtmpLive: boolean;
  status: string;
  startedAt: string;
  endedAt: string | null;
}

export interface LiveParticipant {
  userId: string;
  role: string;
  handRaised: boolean;
  mutedByHost: boolean;
  joinedAt: string;
}

export interface ParticipantPatch {
  role?: string;
  handRaised?: boolean;
  mutedByHost?: boolean;
}
