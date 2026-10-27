import { Injectable } from "@nestjs/common";

const COOLDOWN_MS = 60 * 1000;

// Пауза между рассылками одного бота (lastBroadcastAt в server/routes/bots.js): в памяти процесса.
@Injectable()
export class BroadcastCooldownStore {
  private readonly lastAt = new Map<string, number>();

  /** Сколько ещё ждать, мс; 0 — можно. */
  public waitMs(botId: string): number {
    const since = Date.now() - (this.lastAt.get(botId) ?? 0);
    return since < COOLDOWN_MS ? COOLDOWN_MS - since : 0;
  }

  /** Рассылка началась. Истёкшие записи не нужны — заодно чистим, чтобы карта не росла. */
  public start(botId: string): void {
    for (const [id, at] of this.lastAt) if (Date.now() - at >= COOLDOWN_MS) this.lastAt.delete(id);
    this.lastAt.set(botId, Date.now());
  }

  /** Ничего не ушло — владельцу не нужно ждать минуту до повтора. */
  public clear(botId: string): void {
    this.lastAt.delete(botId);
  }
}
