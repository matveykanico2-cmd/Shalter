import fs from "node:fs";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { storage } from "../../../legacy/legacy.js";
import type { Sweep } from "../model/sweep.js";
import { addUploadRefs, UploadRefsRepository } from "../upload-refs.repository.js";

// Каталог загрузок на диске, как у server/lib/orphanSweep.js (относительно cwd).
const uploadDir = () => path.join(process.cwd(), "data", "uploads");
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const DELIVERED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const MB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

interface Removed {
  removed: number;
  freedBytes: number;
}

// Уборка файлов на диске — server/lib/orphanSweep.js: через 5 минут после запуска, потом
// раз в сутки. Файлы без единой ссылки старше суток удаляются; вложения, которые прочитали
// все участники чата, — через неделю, если на них больше ничего не ссылается. На S3 уборки нет.
@Injectable()
export class UploadsSweep implements Sweep {
  public readonly name = "uploads";
  public readonly intervalMs = 24 * 60 * 60 * 1000;
  public readonly firstDelayMs = 5 * 60 * 1000;
  public readonly failMessage = "[uploads] уборка не удалась:";
  public readonly logErrorMessageOnly = true;

  public constructor(private readonly refs: UploadRefsRepository) {}

  public disabledReason(): string | null {
    return storage().isS3Enabled ? "[uploads] хранилище — S3, автоматическая уборка файлов пока работает только для локального диска" : null;
  }

  public once(now: Date): void {
    if (storage().isS3Enabled) return;
    const orphans = this.sweepOrphans(now);
    if (orphans.removed) console.log(`[uploads] убрано файлов без ссылок: ${orphans.removed}, освобождено ${MB(orphans.freedBytes)} МБ`);
    const delivered = this.sweepDelivered(now);
    if (delivered.removed) console.log(`[uploads] отдано и забыто: ${delivered.removed} файлов, освобождено ${MB(delivered.freedBytes)} МБ`);
  }

  private sweepOrphans(now: Date): Removed {
    const dir = uploadDir();
    if (!fs.existsSync(dir)) return { removed: 0, freedBytes: 0 };
    const referenced = new Set<string>();
    this.refs.scanMessageTexts(referenced);
    this.refs.scanAllTables(referenced);
    let removed = 0;
    let freedBytes = 0;
    for (const name of fs.readdirSync(dir)) {
      if (referenced.has(name)) continue;
      const full = path.join(dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile() || now.getTime() - stat.mtimeMs < MIN_AGE_MS) continue;
      freedBytes += stat.size;
      removed += 1;
      try {
        fs.unlinkSync(full);
      } catch {
        // занят или уже удалён
      }
    }
    return { removed, freedBytes };
  }

  private sweepDelivered(now: Date): Removed {
    const dir = uploadDir();
    if (!fs.existsSync(dir)) return { removed: 0, freedBytes: 0 };
    const cutoff = new Date(now.getTime() - DELIVERED_GRACE_MS).toISOString();
    const rows = this.refs.listDeliveredCandidates(cutoff);
    if (!rows) return { removed: 0, freedBytes: 0 };

    // Всё, что ещё нужно: свежие и недочитанные сообщения, стикеры, все прочие таблицы, превью.
    const stillNeeded = new Set<string>();
    this.refs.scanNeededAttachments(stillNeeded, cutoff);
    this.refs.scanAllTables(stillNeeded, ["messages"]);
    this.refs.scanThumbnails(stillNeeded);

    const candidates = new Set<string>();
    for (const row of rows) {
      let readers: unknown[] = [];
      try {
        readers = JSON.parse(row.readByIds || "[]");
      } catch {
        continue;
      }
      if (!row.members || readers.length < row.members) continue;
      addUploadRefs(candidates, String(row.attachments));
    }

    let removed = 0;
    let freedBytes = 0;
    for (const name of candidates) {
      if (stillNeeded.has(name)) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        freedBytes += stat.size;
        removed += 1;
        fs.unlinkSync(full);
      } catch {
        // файла уже нет
      }
    }
    return { removed, freedBytes };
  }
}
