import { Injectable } from "@nestjs/common";
import { HELPER_BOT_ID } from "../../../common/config/accounts.js";
import { sendMessageAndBroadcast } from "../../../legacy/legacy.js";
import { ChatsRepository } from "../../chats/chats.repository.js";
import type { Sweep } from "../model/sweep.js";
import { RemindersRepository } from "../reminders.repository.js";

// Напоминания /remind — server/lib/reminderSweep.js: раз в 20 секунд, от помощника в тот же
// чат, если автор ещё в нём. Отмечается отправленным и при ошибке — второй раз не придёт.
@Injectable()
export class RemindersSweep implements Sweep {
  public readonly name = "reminders";
  public readonly intervalMs = 20_000;
  public readonly failMessage = "reminder sweep failed:";

  public constructor(
    private readonly reminders: RemindersRepository,
    private readonly chats: ChatsRepository
  ) {}

  public async once(now: Date): Promise<void> {
    const due = this.reminders.listDue(now.toISOString());
    for (const reminder of due) {
      try {
        const chat = this.chats.findById(reminder.chatId);
        if (chat && chat.memberIds.includes(reminder.userId)) {
          await sendMessageAndBroadcast(chat, HELPER_BOT_ID, `⏰ Напоминание: ${reminder.text}`);
        }
      } catch (err) {
        console.error(`reminder ${reminder.id} failed to deliver:`, err);
      } finally {
        this.reminders.markSent(reminder.id);
      }
    }
  }
}
