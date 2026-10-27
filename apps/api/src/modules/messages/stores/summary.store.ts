import { Injectable } from "@nestjs/common";

const MAX_CACHED = 2000;
const PER_MINUTE = 10;

// «Кратко»: готовые ИИ-сводки по сообщению и времени правки, чтобы модель не дёргалась на
// каждый клик, и счётчик сводок пользователя за минуту. В памяти процесса.
@Injectable()
export class SummaryStore {
  private readonly cache = new Map<string, string>();
  private readonly hits = new Map<string, number[]>();

  public get(key: string): string | undefined {
    return this.cache.get(key);
  }

  public set(key: string, summary: string): void {
    if (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, summary);
  }

  /** Засчитывает сводку; false — за последнюю минуту их уже 10. */
  public take(uid: string, now = Date.now()): boolean {
    const recent = (this.hits.get(uid) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= PER_MINUTE) return false;
    this.hits.set(uid, [...recent, now]);
    return true;
  }
}
