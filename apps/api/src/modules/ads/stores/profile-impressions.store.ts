import { Injectable, type OnModuleDestroy } from "@nestjs/common";

const WINDOW_MS = 30 * 60 * 1000;

// Реклама в профиле нацелена на одного рекламодателя, и зритель мог бы выжечь его бюджет,
// открывая профиль снова и снова. Каждый зритель оплачивается раз в окно на кампанию
// (server/routes/ads.js): в памяти процесса, приложение — один процесс.
@Injectable()
export class ProfileImpressionsStore implements OnModuleDestroy {
  private readonly lastAt = new Map<string, number>();
  // Истёкшие записи чистит таймер, а не запрос: наплыв новых зрителей не заставит /serve
  // перебирать всю карту.
  private readonly sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, at] of this.lastAt) if (now - at >= WINDOW_MS) this.lastAt.delete(key);
  }, WINDOW_MS).unref();

  /** Оплачивать ли этот показ; true — показ засчитан, следующий от зрителя — через окно. */
  public shouldBill(viewerId: string, campaignId: string): boolean {
    const now = Date.now();
    const key = `${viewerId}:${campaignId}`;
    const last = this.lastAt.get(key);
    if (last && now - last < WINDOW_MS) return false;
    this.lastAt.set(key, now);
    return true;
  }

  public onModuleDestroy(): void {
    clearInterval(this.sweep);
  }
}
