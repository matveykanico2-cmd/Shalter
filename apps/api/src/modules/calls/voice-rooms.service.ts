import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { CallsRepository } from "./calls.repository.js";

// Голосовой чат группы — звонок kind «voice-room»: первый вошедший его создаёт, последний
// вышедший завершает. Об изменениях узнают все участники группы (voicechat:updated).
@Injectable()
export class VoiceRoomsService {
  public constructor(
    private readonly calls: CallsRepository,
    private readonly chats: ChatsRepository,
    private readonly realtime: RealtimeService
  ) {}

  public room(uid: string, chatId: string) {
    const chat = this.chats.findById(chatId);
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "not found");
    return { call: this.calls.findActiveRoom(chatId) ?? null };
  }

  public join(uid: string, chatId: string) {
    const chat = this.chats.findById(chatId);
    if (!chat || !chat.memberIds.includes(uid) || chat.type !== "group") throw new ApiError(404, "not found");

    let room = this.calls.findActiveRoom(chatId);
    if (!room) {
      room = this.calls.create({
        id: genId("cl"),
        chatId: chat.id,
        kind: "voice-room",
        direction: "outgoing",
        callerId: uid,
        participantIds: [uid],
        status: "ongoing",
        startedAt: new Date().toISOString(),
        durationSec: 0,
      });
    } else if (!room.participantIds.includes(uid)) {
      room = this.calls.addParticipant(room.id, uid)!;
    }

    this.realtime.broadcastToUsers(room.participantIds.filter((id) => id !== uid), { type: "call:participants-updated", call: room });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "voicechat:updated", chatId: chat.id, call: room });
    return { call: room };
  }

  /** Не в комнате (и даже не в группе) — {ok:true}. */
  public leave(uid: string, chatId: string) {
    const chat = this.chats.findById(chatId);
    if (!chat) throw new ApiError(404, "not found");
    const room = this.calls.findActiveRoom(chatId);
    if (!room || !room.participantIds.includes(uid)) return { ok: true };

    let updated = this.calls.removeParticipant(room.id, uid)!;
    if (!updated.participantIds.length) updated = this.calls.update(room.id, { status: "ended" })!;

    this.realtime.broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
    this.realtime.broadcastToUsers(chat.memberIds, {
      type: "voicechat:updated",
      chatId: chat.id,
      call: updated.status === "ongoing" ? updated : null,
    });
    return { ok: true };
  }
}
