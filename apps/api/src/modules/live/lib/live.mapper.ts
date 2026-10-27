import type { LiveParticipant, LiveParticipantRow, LiveStream, LiveStreamRow } from "../model/domain.js";

// Эфир и участник из строк таблиц — rowToStream и rowToParticipant в server/data/liveStreams.js.
export function toStream(row: LiveStreamRow): LiveStream {
  return {
    id: row.id,
    chatId: row.chatId,
    hostId: row.hostId,
    title: row.title ?? "",
    withVideo: !!row.withVideo,
    source: row.source ?? "webrtc",
    rtmpLive: !!row.rtmpLive,
    status: row.status,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
  };
}

export function toParticipant(row: LiveParticipantRow): LiveParticipant {
  return {
    userId: row.userId,
    role: row.role,
    handRaised: !!row.handRaised,
    mutedByHost: !!row.mutedByHost,
    joinedAt: row.joinedAt,
  };
}
