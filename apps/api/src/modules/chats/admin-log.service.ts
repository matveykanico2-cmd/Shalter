import { Injectable } from "@nestjs/common";
import { AdminLogRepository } from "./admin-log.repository.js";
import type { AdminLogEntry } from "./model/domain.js";

const KEEP_DAYS = 30;

// Журнал действий администраторов («Недавние действия» в Telegram): кто кого удалил,
// заблокировал, повысил, что поменял. Хранится 30 дней.
@Injectable()
export class AdminLogService {
  public constructor(private readonly log: AdminLogRepository) {}

  public record(chatId: string, actorId: string, action: string, { targetId = null, details = null }: { targetId?: string | null; details?: unknown } = {}): void {
    try {
      this.log.insert({ chatId, actorId, action, targetId, details: details ? JSON.stringify(details) : null, createdAt: new Date().toISOString() });
    } catch {
      // Журнал — вспомогательный: из-за него действие не должно падать.
    }
  }

  public list(chatId: string, { limit = 100, beforeId = null }: { limit?: number; beforeId?: number | null } = {}): AdminLogEntry[] {
    this.log.deleteOlderThan(chatId, new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString());
    return this.log.list(chatId, limit, beforeId).map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      targetId: r.targetId ?? undefined,
      details: r.details ? parseDetails(r.details) : undefined,
      createdAt: r.createdAt,
    }));
  }
}

function parseDetails(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
