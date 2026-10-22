import { Injectable } from "@nestjs/common";
import { CallSignalsService } from "../calls/call-signals.service.js";
import { LiveRepository } from "../live/live.repository.js";
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
    private readonly callSignals: CallSignalsService,
    private readonly live: LiveRepository
  ) {}

  public relayLiveSignal(uid: string, { streamId, toUserId, kind, data }: SignalMessage): void {
    if (typeof streamId !== "string" || typeof toUserId !== "string") return;
    const stream = this.live.findStream(streamId);
    if (!stream || stream.status !== "live") return;
    if (!this.live.findParticipant(streamId, uid) || !this.live.findParticipant(streamId, toUserId)) return;
    this.realtime.broadcastToUsers([toUserId], { type: "live:signal", streamId, fromUserId: uid, kind, data });
  }

  public relayCallSignal(uid: string, msg: SignalMessage): void {
    this.callSignals.relayFromSocket(uid, msg);
  }
}
