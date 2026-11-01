import { Injectable } from "@nestjs/common";
import { queueJob, type Attachment } from "../../../legacy/legacy.js";
import { messageNeedsMedia } from "../lib/media-attachments.js";
import { MediaBackfillRepository } from "../media-backfill.repository.js";
import type { Sweep } from "../model/sweep.js";

const SCAN = 500;
const PER_PASS = 20;
/** Свежие сообщения обрабатывает задача, которую ставит сама отправка. */
const FRESH_MS = 60 * 60 * 1000;

// Превью, обложки и длительность для старых вложений. Задача «message-media» ставится при
// отправке, но у сообщений до очереди задач её не было, а упавшая не повторялась: старые
// видео без обложки показывались серой плиткой с треугольником, фото без превью грузились
// оригиналом. Обход идёт от новых к старым, ставит не больше PER_PASS задач за проход и
// каждому сообщению — один раз (media_backfill). Дошёл до самых старых — до перезапуска спит.
@Injectable()
export class MediaBackfillSweep implements Sweep {
  public readonly name = "media-backfill";
  public readonly intervalMs = 10 * 60 * 1000;
  public readonly firstDelayMs = 2 * 60 * 1000;
  public readonly failMessage = "media backfill sweep failed:";

  private cursor: number | null = null;
  private done = false;

  public constructor(private readonly backfill: MediaBackfillRepository) {}

  public once(now: Date): void {
    if (this.done) return;
    const createdBefore = new Date(now.getTime() - FRESH_MS).toISOString();
    let queued = 0;
    while (queued < PER_PASS) {
      const rows = this.backfill.candidates(this.cursor, createdBefore, SCAN);
      const already = this.backfill.queuedOf(rows.map((r) => r.id));
      for (const row of rows) {
        this.cursor = row.rowid;
        if (already.has(row.id) || !needsMedia(row.attachments)) continue;
        queueJob("message-media", { messageId: row.id });
        this.backfill.markQueued(row.id, now.toISOString());
        if (++queued >= PER_PASS) return;
      }
      if (rows.length < SCAN) {
        this.done = true;
        return;
      }
    }
  }
}

function needsMedia(json: string): boolean {
  try {
    const attachments = JSON.parse(json) as Attachment[];
    return Array.isArray(attachments) && messageNeedsMedia({ attachments });
  } catch {
    return false;
  }
}
