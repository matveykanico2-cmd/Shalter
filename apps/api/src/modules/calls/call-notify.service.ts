import { Injectable } from "@nestjs/common";
import { push } from "../../legacy/legacy.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import type { Call } from "./model/domain.js";

// Кому можно звонить и как об этом узнают: call:incoming по сокету и пуш на устройства.
@Injectable()
export class CallNotifyService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService,
    private readonly privacy: UserPrivacyService
  ) {}

  /** Не заблокировал звонящего и пускает его правилом приватности calls. */
  public async canCall(callerId: string, targetId: unknown): Promise<boolean> {
    const target = typeof targetId === "string" ? this.users.findById(targetId) : undefined;
    if (!target || target.blockedUserIds?.includes(callerId)) return false;
    return this.privacy.allowsUser(target.id, "calls", callerId);
  }

  /** call:incoming каждому получателю — со своей проекцией звонящего. */
  public async broadcastIncoming(call: Call, recipientIds: string[]): Promise<void> {
    for (const uid of recipientIds) {
      this.realtime.broadcastToUsers([uid], { type: "call:incoming", call: await this.withCaller(call, uid) });
    }
  }

  public async pushIncoming(call: Call, callerId: string, recipientIds: string[]): Promise<void> {
    const notify = push();
    const caller = this.users.findById(callerId);
    const title = caller?.name ?? "Входящий звонок";
    const body = call.kind === "video" ? "Видеозвонок…" : "Звонит…";
    await Promise.all(
      recipientIds
        .filter((id) => id !== callerId)
        .map(async (uid) =>
          notify.sendPushToUser(
            uid,
            {
              title,
              body,
              ...(await notify.userPushAvatar(caller, uid)),
              url: `/call/${call.id}`,
              tag: `call-${call.id}`,
              requireInteraction: true,
              kind: "call",
              callId: call.id,
              video: call.kind === "video" ? "1" : "0",
            },
            notify.CALL_PUSH
          )
        )
    );
  }

  /** Звонок закончился: убрать «входящий» с устройств; пропущенный — уведомлением о пропущенном. */
  public async pushCancelled(call: Call, recipientIds: string[], { missed = false, callerName = "" } = {}): Promise<void> {
    const notify = push();
    await Promise.all(
      recipientIds
        .filter((id) => id !== call.callerId)
        .map((uid) =>
          missed
            ? notify
                .sendPushToUser(
                  uid,
                  {
                    title: callerName || "Пропущенный звонок",
                    body: callerName ? "Пропущенный звонок" : "Вам звонили",
                    url: `/chat/${call.chatId}`,
                    tag: `call-${call.id}`,
                    kind: "call-missed",
                    callId: call.id,
                  },
                  notify.CALL_CANCEL_PUSH
                )
                .catch(() => {})
            : notify
                .sendPushToUser(uid, { title: "", kind: "call-cancelled", tag: `call-${call.id}`, callId: call.id }, notify.CALL_CANCEL_PUSH)
                .catch(() => {})
        )
    );
  }

  // Профиль звонящего — глазами получателя (приватность lastSeen, фото и т. д.).
  private async withCaller(call: Call, viewerId: string) {
    const caller = this.users.findById(call.callerId);
    return { ...call, otherUser: caller ? this.privacy.publicUserFor(caller, viewerId) : undefined };
  }
}
