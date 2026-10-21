import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

// Вход по QR-коду (server/data/qrLogins.js): токен показывает новое устройство, вошедшее
// подтверждает его, новое забирает вход. 90 секунд.
const TTL_MS = 90 * 1000;

interface QrEntry {
  deviceId: string;
  confirmedUserId: string | null;
  expiresAt: number;
}

@Injectable()
export class QrLoginsStore {
  private readonly pending = new Map<string, QrEntry>();

  public createToken(deviceId: string): string {
    const token = randomBytes(20).toString("hex");
    this.pending.set(token, { deviceId, confirmedUserId: null, expiresAt: Date.now() + TTL_MS });
    return token;
  }

  public getEntry(token: string): QrEntry | undefined {
    const entry = this.pending.get(token);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.pending.delete(token);
      return undefined;
    }
    return entry;
  }

  public confirm(token: string, userId: string): "expired" | "already-used" | "ok" {
    const entry = this.getEntry(token);
    if (!entry) return "expired";
    if (entry.confirmedUserId) return "already-used";
    entry.confirmedUserId = userId;
    return "ok";
  }

  public consume(token: string): QrEntry | undefined {
    const entry = this.getEntry(token);
    if (!entry || !entry.confirmedUserId) return undefined;
    this.pending.delete(token);
    return entry;
  }
}
