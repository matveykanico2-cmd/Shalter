import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

export interface SharePayload {
  text: string;
  url: string | null;
  file: { name: string; type: string; base64: string } | null;
}

const BOX_TTL_MS = 15 * 60 * 1000;

// Короткоживущий ящик «Поделиться» и лимит отправок с адреса — в памяти процесса, как в
// server/routes/shareTarget.js. Положили на /share-target, забрали один раз на /api/share/:token.
@Injectable()
export class ShareBoxStore {
  private readonly box = new Map<string, { payload: SharePayload; expiresAt: number }>();
  private readonly hits = new Map<string, number[]>();

  public put(payload: SharePayload): string {
    const now = Date.now();
    for (const [key, item] of this.box) if (item.expiresAt <= now) this.box.delete(key);
    // Больше 30 нерасходуемых записей — вытесняем самые старые.
    if (this.box.size >= 30) {
      const oldest = [...this.box.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt).slice(0, this.box.size - 29);
      for (const [key] of oldest) this.box.delete(key);
    }
    const token = randomBytes(16).toString("hex");
    this.box.set(token, { payload, expiresAt: now + BOX_TTL_MS });
    return token;
  }

  public take(token: string): SharePayload | null {
    const item = this.box.get(token);
    if (!item) return null;
    this.box.delete(token);
    return item.expiresAt <= Date.now() ? null : item.payload;
  }

  /** Тело разбирается в память, поэтому с одного адреса — не больше 20 отправок в минуту. */
  public allow(ip: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 20) {
      this.hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(ip, recent);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}
