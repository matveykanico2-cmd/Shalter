import { Injectable } from "@nestjs/common";
import type { Sweep } from "../model/sweep.js";

// Уборка файлов на диске — ОТКЛЮЧЕНА: старые медиа больше не удаляются.
// server/lib/orphanSweep.js lasciato как есть для совместимости, но таймер не стартует.
@Injectable()
export class UploadsSweep implements Sweep {
  public readonly name = "uploads";
  public readonly intervalMs = 24 * 60 * 60 * 1000;
  public readonly firstDelayMs = 5 * 60 * 1000;
  public readonly failMessage = "[uploads] уборка не удалась:";
  public readonly logErrorMessageOnly = true;

  public disabledReason(): string | null {
    return null;
  }

  public once(now: Date): void {
    // ничего не удаляем
  }
}
