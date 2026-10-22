import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { TEST_MODE } from "../../common/lib/test-mode.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { nextOccurrence } from "./lib/scheduled-repeat.js";
import { MessageSendService, type MessageDraft } from "./message-send.service.js";
import type { ScheduledMessage } from "./model/domain.js";
import { ScheduledMessagesRepository } from "./scheduled-messages.repository.js";

const SWEEP_INTERVAL_MS = 20_000;

// Отправка отложенных — как server/lib/scheduledMessagesSweep.js: по сроку раз в 20 секунд,
// «когда будет в сети» — и сразу при входе собеседника в сеть. Под Nest старый проход не
// запускается (startRuntime с ownScheduledSweep), иначе сообщение ушло бы дважды.
@Injectable()
export class ScheduledDeliveryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private delivering: Promise<void> = Promise.resolve();

  public constructor(
    private readonly scheduled: ScheduledMessagesRepository,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly sender: MessageSendService,
    private readonly realtime: RealtimeService
  ) {}

  public onApplicationBootstrap(): void {
    this.realtime.onUserOnline(() => this.sendWhenOnline().catch((err) => console.error("when-online send failed:", err)));
    if (TEST_MODE) return;
    this.timer = setInterval(() => {
      this.sweepOnce().catch((err) => console.error("scheduled-messages sweep failed:", err));
    }, SWEEP_INTERVAL_MS);
  }

  public onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  public async sweepOnce(): Promise<void> {
    await this.deliverAll(this.scheduled.listDue(new Date().toISOString()));
    await this.sendWhenOnline();
  }

  /** «Когда будет в сети»: отправляем, если собеседник сейчас онлайн (или чата и собеседника уже нет). */
  public async sendWhenOnline(): Promise<void> {
    const ready: ScheduledMessage[] = [];
    for (const scheduled of this.scheduled.listWhenOnline()) {
      const chat = this.chats.findById(scheduled.chatId);
      const otherId = chat?.memberIds.find((id) => id !== scheduled.senderId);
      if (!chat || !otherId || this.users.findById(otherId)?.online) ready.push(scheduled);
    }
    await this.deliverAll(ready);
  }

  // Таймер и вход в сеть могут совпасть — без очереди сообщение ушло бы дважды.
  private deliverAll(list: ScheduledMessage[]): Promise<void> {
    this.delivering = this.delivering.then(() => this.deliverList(list)).catch((err) => console.error("scheduled delivery failed:", err));
    return this.delivering;
  }

  private async deliverList(list: ScheduledMessage[]): Promise<void> {
    for (const listed of list) {
      const scheduled = this.scheduled.find(listed.id);
      // Уже отправлено или перенесено (повтор) другим проходом.
      if (!scheduled || scheduled.sendAt !== listed.sendAt) continue;
      let gone = false;
      try {
        const chat = this.chats.findById(scheduled.chatId);
        const body: MessageDraft = { text: scheduled.text, attachments: scheduled.attachments, replyToId: scheduled.replyToId, topicId: scheduled.topicId };
        if (chat && chat.memberIds.includes(scheduled.senderId)) {
          // Права могли измениться с момента планирования (сняли админку, заблокировали).
          const charged = await this.gate(chat, scheduled, body);
          if (charged !== null) await this.sender.deliver(chat, scheduled.senderId, body, { paidStars: charged });
        } else {
          gone = true;
        }
      } catch (err) {
        console.error(`scheduled message ${scheduled.id} failed to send:`, err);
      } finally {
        const next = scheduled.repeat && !gone ? nextOccurrence(scheduled.sendAt, scheduled.repeat) : null;
        if (next) this.scheduled.reschedule(scheduled.id, next);
        else this.scheduled.remove(scheduled.id);
      }
    }
  }

  /** Списанные звёзды; null — отправка запрещена (сообщение пропадает, как в server/). */
  private async gate(chat: NonNullable<ReturnType<ChatsRepository["findById"]>>, scheduled: ScheduledMessage, body: MessageDraft): Promise<number | null> {
    try {
      return (await this.sender.gate(chat, scheduled.senderId, body, { skipSlowMode: true })).charged;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      console.warn(`scheduled message ${scheduled.id} dropped: ${(err.getResponse() as { error?: string }).error}`);
      return null;
    }
  }
}
