import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { CallsRepository } from "./calls.repository.js";
import type { Signal } from "./model/domain.js";
import type { SendSignalDto, SignalsQueryDto } from "./model/schemas/call.schema.js";
import { SignalsRepository } from "./signals.repository.js";

/** Сигнал WebRTC, присланный по сокету (call:signal:send). */
export interface SocketCallSignal {
  callId?: unknown;
  toUserId?: unknown;
  kind?: unknown;
  data?: unknown;
}

const isSignalKind = (kind: unknown): kind is string => typeof kind === "string" && !!kind && kind.length <= 32;

// Сигналы WebRTC между участниками звонка. Основной путь — сокет (call:signal:send), HTTP —
// запасной при переподключении: сигнал сохраняется, и опрос забирает пропущенное.
@Injectable()
export class CallSignalsService {
  public constructor(
    private readonly calls: CallsRepository,
    private readonly signals: SignalsRepository,
    private readonly realtime: RealtimeService
  ) {}

  public list(uid: string, id: string, { after }: SignalsQueryDto) {
    this.participantCall(id, uid);
    const from = Number(after ?? "0");
    return { signals: this.signals.listFor(id, uid, Number.isFinite(from) ? from : 0) };
  }

  public send(uid: string, id: string, { toUserId, kind, data }: SendSignalDto) {
    const call = this.participantCall(id, uid);
    if (!call.participantIds.includes(toUserId as string)) throw new ApiError(400, "invalid recipient");
    if (!isSignalKind(kind)) throw new ApiError(400, "invalid kind");
    return { signal: this.deliver({ callId: id, fromUserId: uid, toUserId: toUserId as string, kind, data }) };
  }

  /** Сигнал по сокету: чужой звонок, адресат вне звонка или плохой kind — молча отбрасывается. */
  public relayFromSocket(uid: string, { callId, toUserId, kind, data }: SocketCallSignal): void {
    const call = typeof callId === "string" ? this.calls.findById(callId) : undefined;
    if (!call || !call.participantIds.includes(uid) || !call.participantIds.includes(toUserId as string)) return;
    if (!isSignalKind(kind)) return;
    this.deliver({ callId: call.id, fromUserId: uid, toUserId: toUserId as string, kind, data });
  }

  private deliver(input: Omit<Signal, "id" | "seq" | "createdAt">): Signal {
    const signal = this.signals.add(input);
    this.realtime.broadcastToUsers([input.toUserId], { type: "call:signal", signal });
    return signal;
  }

  private participantCall(id: string, uid: string) {
    const call = this.calls.findById(id);
    if (!call || !call.participantIds.includes(uid)) throw new ApiError(404, "not found");
    return call;
  }
}
