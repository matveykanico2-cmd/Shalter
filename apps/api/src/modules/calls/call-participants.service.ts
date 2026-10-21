import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { CallNotifyService } from "./call-notify.service.js";
import { CallsRepository } from "./calls.repository.js";
import type { Call } from "./model/domain.js";
import type { AddParticipantDto } from "./model/schemas/call.schema.js";

// Состав звонка: добавить человека, убрать (только звонящий), ссылка-приглашение и вход по ней.
@Injectable()
export class CallParticipantsService {
  public constructor(
    private readonly calls: CallsRepository,
    private readonly users: UsersRepository,
    private readonly notify: CallNotifyService,
    private readonly realtime: RealtimeService
  ) {}

  public async add(uid: string, id: string, { userId }: AddParticipantDto) {
    const call = this.participantCall(id, uid);
    if (call.participantIds.includes(userId as string)) return { call };
    // Не путаем «нет такого человека» с запретом звонков. Заблокировавший
    // по-прежнему выглядит как «ограничил звонки» — блокировку не раскрываем.
    const target = typeof userId === "string" && userId ? this.users.findById(userId) : undefined;
    if (!target) throw new ApiError(404, "Пользователь не найден");
    if (target.isBot) throw new ApiError(400, "Боту позвонить нельзя");
    if (!(await this.notify.canCall(uid, target.id))) throw new ApiError(403, "Пользователь ограничил звонки");
    const updated = this.calls.addParticipant(id, target.id)!;
    this.realtime.broadcastToUsers(
      updated.participantIds.filter((pid) => pid !== target.id),
      { type: "call:participants-updated", call: updated }
    );
    await this.notify.broadcastIncoming(updated, [target.id]);
    this.notify.pushIncoming(updated, updated.callerId, [target.id]).catch((err: unknown) => console.error("push notify failed:", err));
    return { call: updated };
  }

  public remove(uid: string, id: string, userId: string) {
    const call = this.participantCall(id, uid);
    if (call.callerId !== uid) throw new ApiError(403, "Убрать участника может только тот, кто начал звонок");
    if (userId === uid) throw new ApiError(400, "Чтобы выйти самому, завершите звонок");
    if (!call.participantIds.includes(userId)) return { call };

    const updated = this.calls.removeParticipant(id, userId)!;
    this.realtime.broadcastToUsers([userId], { type: "call:updated", call: { ...updated, status: "ended" } });
    this.realtime.broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
    return { call: updated };
  }

  /** Постоянная ссылка-приглашение в идущий звонок — для всех (раньше только с Premium). */
  public inviteLink(uid: string, id: string, origin: string) {
    const call = this.participantCall(id, uid);
    if (call.status !== "ongoing") throw new ApiError(400, "Звонок уже завершён");
    const token = call.joinToken ?? randomBytes(16).toString("hex");
    if (!call.joinToken) this.calls.setJoinToken(call.id, token);
    return { url: `${origin}/call-join/${token}` };
  }

  /** Вход по ссылке — без проверки приватности звонков: ссылку дал участник. */
  public join(uid: string, token: string) {
    const call = this.calls.findByJoinToken(token);
    if (!call || call.status !== "ongoing") throw new ApiError(404, "Ссылка недействительна или звонок уже завершён");
    const updated = this.calls.addParticipant(call.id, uid)!;
    this.realtime.broadcastToUsers(
      updated.participantIds.filter((pid) => pid !== uid),
      { type: "call:participants-updated", call: updated }
    );
    return { call: updated };
  }

  private participantCall(id: string, uid: string): Call {
    const call = this.calls.findById(id);
    if (!call || !call.participantIds.includes(uid)) throw new ApiError(404, "not found");
    return call;
  }
}
