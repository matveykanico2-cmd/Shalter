import { randomInt, timingSafeEqual } from "node:crypto";

// Шестизначные одноразовые коды в памяти процесса (сервер работает одним процессом, см.
// DEPLOY.md): код живёт TTL, после MAX_ATTEMPTS неверных попыток сгорает, верный — гасится.
// Как server/data/codeLogins.js, emailChanges.js и pairRecoveries.js.

interface Entry<T> {
  code: string;
  payload: T;
  expiresAt: number;
  attempts: number;
}

export class OneTimeCodes<T = true> {
  private readonly pending = new Map<string, Entry<T>>();

  public constructor(
    private readonly ttlMs: number,
    private readonly maxAttempts = 5,
    // Сравнение, устойчивое к подбору по времени, с пробелами внутри кода (коды из писем).
    private readonly timingSafe = false
  ) {}

  public start(key: string, payload: T): string {
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    this.pending.set(key, { code, payload, expiresAt: Date.now() + this.ttlMs, attempts: 0 });
    return code;
  }

  // Полезная нагрузка, если код верный (и больше не действует), иначе null.
  public confirm(key: string, code: unknown): T | null {
    const entry = this.pending.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.pending.delete(key);
      return null;
    }
    if (!this.matches(entry.code, code)) {
      entry.attempts += 1;
      if (entry.attempts >= this.maxAttempts) this.pending.delete(key);
      return null;
    }
    this.pending.delete(key);
    return entry.payload;
  }

  private matches(expected: string, code: unknown): boolean {
    if (!this.timingSafe) return expected === String(code ?? "").trim();
    const given = Buffer.from(String(code ?? "").replace(/\s/g, ""));
    const want = Buffer.from(expected);
    return given.length === want.length && timingSafeEqual(given, want);
  }
}
