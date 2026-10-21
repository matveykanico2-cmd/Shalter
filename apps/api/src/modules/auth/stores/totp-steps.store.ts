import { Injectable } from "@nestjs/common";
import { STEP_SECONDS, WINDOW_STEPS } from "../lib/totp.js";

// Уже принятые шаги TOTP по пользователям (server/data/totpSteps.js): один и тот же код из
// приложения нельзя использовать второй раз (RFC 6238 §5.2), даже с новым билетом входа.
// Код живёт не дольше окна ±1 шаг (~1,5 мин) — после перезапуска окно уже прошло.
@Injectable()
export class TotpStepsStore {
  private readonly used = new Map<string, Set<number>>();

  // true — шаг ещё не использовался и теперь помечен; false — повтор.
  public claim(userId: string, step: number): boolean {
    this.sweep();
    let steps = this.used.get(userId);
    if (!steps) this.used.set(userId, (steps = new Set()));
    if (steps.has(step)) return false;
    steps.add(step);
    return true;
  }

  // Новый секрет — прежние шаги к нему отношения не имеют.
  public forget(userId: string): void {
    this.used.delete(userId);
  }

  private sweep(): void {
    const oldest = Math.floor(Date.now() / 1000 / STEP_SECONDS) - WINDOW_STEPS - 1;
    for (const [userId, steps] of this.used) {
      for (const step of steps) if (step < oldest) steps.delete(step);
      if (steps.size === 0) this.used.delete(userId);
    }
  }
}
