import { Injectable } from "@nestjs/common";

const WINDOW_MS = 3600_000;
/** Строк, которые с одного адреса можно отдать переводчику за час (экраны входа — несколько десятков). */
const PER_IP = 600;
/** И со всех адресов вместе. */
const TOTAL = 20_000;
const MAX_IPS = 10_000;

// Перевод интерфейса без входа (POST /api/translate/ui): сколько строк ещё можно перевести у
// Google — в памяти процесса, окно в час. Сверх лимита отдаётся только то, что уже есть в кэше.
@Injectable()
export class GuestTranslationBudgetStore {
  private windowStart = Date.now();
  private total = 0;
  private readonly byIp = new Map<string, number>();

  /** Сколько из wanted строк можно перевести сейчас (и списать их). */
  public take(ip: string, wanted: number): number {
    const now = Date.now();
    if (now - this.windowStart >= WINDOW_MS) {
      this.windowStart = now;
      this.total = 0;
      this.byIp.clear();
    }
    const used = this.byIp.get(ip) ?? 0;
    if (!this.byIp.has(ip) && this.byIp.size >= MAX_IPS) return 0;
    const granted = Math.max(0, Math.min(wanted, PER_IP - used, TOTAL - this.total));
    if (granted) {
      this.byIp.set(ip, used + granted);
      this.total += granted;
    }
    return granted;
  }
}
