import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../../common/config/accounts.js";
import { findOrCreateDm, sendMessageAndBroadcast, sendMessagePush } from "../../../legacy/legacy.js";
import { BUILTIN_HOLIDAYS } from "../../settings/lib/holidays.js";
import { UserSettingsService } from "../../users/user-settings.service.js";
import { UsersRepository } from "../../users/users.repository.js";
import { GreetingsRepository } from "../greetings.repository.js";
import type { Sweep } from "../model/sweep.js";

interface Holiday {
  id: string;
  title: string;
  date: string;
}

const monthDay = (now: Date) => `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// Праздники — server/lib/holidaySweep.js: раз в час и сразу при запуске. Встроенные и свои
// праздники пользователя (кроме отключённых) — поздравление от Shalter и пуш, раз в год.
@Injectable()
export class HolidaysSweep implements Sweep {
  public readonly name = "holidays";
  public readonly intervalMs = 60 * 60 * 1000;
  public readonly runAtStart = true;
  public readonly failMessage = "holiday sweep failed:";

  public constructor(
    private readonly users: UsersRepository,
    private readonly settings: UserSettingsService,
    private readonly greetings: GreetingsRepository
  ) {}

  public async once(now: Date): Promise<void> {
    const today = monthDay(now);
    const year = now.getFullYear();

    for (const user of this.users.findAll()) {
      if (user.isBot) continue;
      const holidays = (this.settings.get(user.id).holidays as { disabled?: string[]; custom?: Holiday[] } | undefined) ?? { disabled: [], custom: [] };
      const disabled = new Set(holidays.disabled ?? []);
      const todays = [...BUILTIN_HOLIDAYS, ...(holidays.custom ?? [])].filter((h) => h.date === today && !disabled.has(h.id));

      for (const holiday of todays) {
        if (this.greetings.holidaySent(user.id, holiday.id, year)) continue;
        try {
          const chat = await findOrCreateDm(SYSTEM_BOT_ID, user.id);
          await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `🎉 Сегодня ${holiday.title}! Поздравляем.`);
          sendMessagePush(user.id, {
            title: `🎉 ${holiday.title}`,
            body: "Праздничное напоминание",
            url: `/chat/${chat.id}`,
            tag: `holiday-${holiday.id}-${year}`,
          }).catch(() => {});
        } catch (err) {
          console.error(`holiday notification failed (user ${user.id}, holiday ${holiday.id}):`, err);
        } finally {
          this.greetings.markHolidaySent(user.id, holiday.id, year);
        }
      }
    }
  }
}
