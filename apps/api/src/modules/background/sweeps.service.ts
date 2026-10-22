import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { runLegacySweep, startLegacySweeps } from "../../legacy/legacy.js";

// Обходы, которые умеет прогнать служебный вызов тестов (SWEEPS в server/lib/sweeps.js).
const SWEEP_NAMES = new Set(["auto-delete", "reminders", "account-deletion", "birthdays", "holidays", "uploads"]);

// Обходы по таймеру фонового процесса — то, что startSweeps в server/lib/sweeps.js. Пока
// они идут старым кодом; перенесённые в Nest запускаются отсюда.
@Injectable()
export class SweepsService {
  /** Запуск по таймеру; в режиме тестов обходы не идут (кроме переноса вложений в S3, если его включил тест). */
  public start(testMode: boolean): void {
    startLegacySweeps(testMode);
  }

  public has(name: string): boolean {
    return SWEEP_NAMES.has(name);
  }

  /** Один проход обхода; now — момент, от которого он считает сроки. */
  public async run(name: string, now: Date): Promise<void> {
    if (!this.has(name)) throw new ApiError(404, "Нет такого обхода");
    await runLegacySweep(name, now);
  }
}
