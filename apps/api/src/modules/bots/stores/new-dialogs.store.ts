import { Injectable } from "@nestjs/common";

export const NEW_DIALOGS_PER_HOUR = 20;

// Сколько новых разговоров бот начал за час (sendMessageToUser; newDialogLog в
// server/routes/botApi.js): в памяти процесса.
@Injectable()
export class NewDialogsStore {
  private readonly log = new Map<string, number[]>();

  /** Можно ли начать ещё один; если да — он засчитан. */
  public allow(botId: string): boolean {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    const fresh = (this.log.get(botId) ?? []).filter((t) => t > hourAgo);
    if (fresh.length >= NEW_DIALOGS_PER_HOUR) {
      this.log.set(botId, fresh);
      return false;
    }
    fresh.push(now);
    this.log.set(botId, fresh);
    return true;
  }
}
