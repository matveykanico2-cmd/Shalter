import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { startLegacySweeps } from "../../legacy/legacy.js";
import type { Sweep } from "./model/sweep.js";
import { AccountDeletionSweep } from "./sweeps/account-deletion.sweep.js";
import { AutoDeleteSweep } from "./sweeps/auto-delete.sweep.js";
import { BirthdaysSweep } from "./sweeps/birthdays.sweep.js";
import { HolidaysSweep } from "./sweeps/holidays.sweep.js";
import { RemindersSweep } from "./sweeps/reminders.sweep.js";
import { UploadsSweep } from "./sweeps/uploads.sweep.js";

// Обходы по таймеру фонового процесса — то, что startSweeps в server/lib/sweeps.js. Приём
// донатов (DonationAlerts, DonatePay) и перенос вложений в S3 остаются в server/.
@Injectable()
export class SweepsService implements OnApplicationShutdown {
  private readonly sweeps: Map<string, Sweep>;
  private readonly timers: NodeJS.Timeout[] = [];

  public constructor(
    autoDelete: AutoDeleteSweep,
    reminders: RemindersSweep,
    accountDeletion: AccountDeletionSweep,
    birthdays: BirthdaysSweep,
    holidays: HolidaysSweep,
    uploads: UploadsSweep
  ) {
    this.sweeps = new Map([autoDelete, reminders, accountDeletion, birthdays, holidays, uploads].map((s) => [s.name, s]));
  }

  /** Запуск по таймеру; в режиме тестов обходы не идут (кроме переноса в S3, если его включил тест). */
  public start(testMode: boolean): void {
    if (!testMode) for (const sweep of this.sweeps.values()) this.schedule(sweep);
    startLegacySweeps(testMode, [...this.sweeps.keys()]);
  }

  public has(name: string): boolean {
    return this.sweeps.has(name);
  }

  /** Один проход обхода; now — момент, от которого он считает сроки. */
  public async run(name: string, now: Date): Promise<void> {
    const sweep = this.sweeps.get(name);
    if (!sweep) throw new ApiError(404, "Нет такого обхода");
    await sweep.once(now);
  }

  public onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  private schedule(sweep: Sweep): void {
    const reason = sweep.disabledReason?.() ?? null;
    if (reason) return console.log(reason);
    const run = () => {
      const fail = (err: unknown) => console.error(sweep.failMessage, sweep.logErrorMessageOnly ? (err as Error).message : err);
      try {
        Promise.resolve(sweep.once(new Date())).catch(fail);
      } catch (err) {
        fail(err);
      }
    };
    const interval = setInterval(run, sweep.intervalMs);
    interval.unref();
    this.timers.push(interval);
    if (sweep.firstDelayMs) {
      const first = setTimeout(run, sweep.firstDelayMs);
      first.unref();
      this.timers.push(first);
    } else if (sweep.runAtStart) run();
  }
}
