import { Injectable } from "@nestjs/common";
import { liveStreams } from "../../legacy/legacy.js";
import { CallSignalsService } from "../calls/call-signals.service.js";
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
// звонка (это делает модуль calls: сигнал ещё и сохраняется для HTTP-опроса после
// переподключения). Чужое молча отбрасывается.
@Injectable()
export class WsSignalsService {
  public constructor(
    private readonly realtime: RealtimeService,
    private readonly callSignals: CallSignalsService
  ) {}

  public relayLiveSignal(uid: string, { streamId, toUserId, kind, data }: SignalMessage): void {
    const live = liveStreams();
    const stream = live.getStream(streamId);
    if (!stream || stream.status !== "live") return;
    if (!live.getParticipant(streamId, uid) || !live.getParticipant(streamId, toUserId)) return;
    this.realtime.broadcastToUsers([toUserId as string], { type: "live:signal", streamId, fromUserId: uid, kind, data });
  }

  public relayCallSignal(uid: string, msg: SignalMessage): void {
    this.callSignals.relayFromSocket(uid, msg);
  }
}
