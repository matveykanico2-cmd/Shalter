import { Injectable } from "@nestjs/common";
import { addSignal, getCall, liveStreams } from "../../legacy/legacy.js";
import { RealtimeService } from "./realtime.service.js";

/** Сигнал WebRTC от клиента: кому, какого вида и с чем. */
export interface SignalMessage {
  streamId?: unknown;
  callId?: unknown;
  toUserId?: unknown;
  kind?: unknown;
  data?: unknown;
}

// Сигналы WebRTC по сокету: эфир — между его участниками, звонок — между участниками
// звонка (сигнал звонка ещё и сохраняется: его забирает HTTP-опрос после переподключения).
// Чужое молча отбрасывается.
@Injectable()
export class WsSignalsService {
  public constructor(private readonly realtime: RealtimeService) {}

  public relayLiveSignal(uid: string, { streamId, toUserId, kind, data }: SignalMessage): void {
    const live = liveStreams();
    const stream = live.getStream(streamId);
    if (!stream || stream.status !== "live") return;
    if (!live.getParticipant(streamId, uid) || !live.getParticipant(streamId, toUserId)) return;
    this.realtime.broadcastToUsers([toUserId as string], { type: "live:signal", streamId, fromUserId: uid, kind, data });
  }

  public async relayCallSignal(uid: string, { callId, toUserId, kind, data }: SignalMessage): Promise<void> {
    const call = await getCall(callId);
    if (!call || !call.participantIds.includes(uid) || !call.participantIds.includes(toUserId as string)) return;
    if (typeof kind !== "string" || !kind || kind.length > 32) return;
    const signal = await addSignal({ callId, fromUserId: uid, toUserId, kind, data });
    this.realtime.broadcastToUsers([toUserId as string], { type: "call:signal", signal });
  }
}
