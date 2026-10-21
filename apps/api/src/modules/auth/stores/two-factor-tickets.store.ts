import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

// Билет между паролем и вторым шагом входа (server/data/twoFactorTickets.js): 5 минут,
// не больше MAX_ATTEMPTS неверных кодов.
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface Ticket {
  userId: string;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class TwoFactorTicketsStore {
  private readonly tickets = new Map<string, Ticket>();

  public create(userId: string): { ticket: string; expiresInSec: number } {
    this.sweep();
    const id = randomBytes(24).toString("base64url");
    this.tickets.set(id, { userId, expiresAt: Date.now() + TTL_MS, attempts: 0 });
    return { ticket: id, expiresInSec: TTL_MS / 1000 };
  }

  public peek(ticket: unknown): Ticket | null {
    const key = String(ticket ?? "");
    const entry = this.tickets.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.tickets.delete(key);
      return null;
    }
    return entry;
  }

  // Сколько попыток осталось; на последней билет сгорает.
  public countFailure(ticket: unknown): number {
    const entry = this.peek(ticket);
    if (!entry) return 0;
    entry.attempts += 1;
    const left = MAX_ATTEMPTS - entry.attempts;
    if (left <= 0) {
      this.tickets.delete(String(ticket));
      return 0;
    }
    return left;
  }

  public consume(ticket: unknown): Ticket | null {
    const entry = this.peek(ticket);
    if (!entry) return null;
    this.tickets.delete(String(ticket));
    return entry;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.tickets) if (entry.expiresAt < now) this.tickets.delete(id);
  }
}
