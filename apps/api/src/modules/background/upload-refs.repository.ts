import { Injectable } from "@nestjs/common";
import { textCrypto } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";

const UPLOAD_REF_RE = /\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g;
// upload_access — права на файлы, а не ссылки на них.
const SKIP_TABLES = new Set(["upload_access", "sqlite_sequence"]);

export interface DeliveredRow {
  attachments: string;
  readByIds: string | null;
  members: number;
}

/** Имена загрузок из /uploads/… в строке. */
export function addUploadRefs(into: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  for (const m of value.matchAll(UPLOAD_REF_RE)) into.add(m[1]!);
}

// Ссылки на загрузки по всей базе — для уборки файлов (server/lib/orphanSweep.js). Ссылки
// живут в десятках колонок, и ручной список таблиц всегда отстаёт от новых фич, поэтому
// обходятся все текстовые колонки всех таблиц; messages.text зашифрован — отдельно. Строки
// идут итератором, не списком: таблица сообщений большая, а куча фонового процесса — нет.
@Injectable()
export class UploadRefsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  private get client(): Db["$client"] {
    return this.db.$client;
  }

  /** Все ссылки, кроме текста сообщений, из всех таблиц, кроме skipTables. */
  public scanAllTables(into: Set<string>, skipTables: string[] = []): void {
    const skip = new Set([...SKIP_TABLES, ...skipTables]);
    const tables = (this.client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    for (const table of tables) {
      if (skip.has(table) || table.startsWith("sqlite_")) continue;
      let columns: { name: string; type: string | null }[] = [];
      try {
        columns = this.client.prepare(`PRAGMA table_info("${table}")`).all() as typeof columns;
      } catch {
        continue;
      }
      for (const { name, type } of columns) {
        if (!/TEXT|^$/i.test(type ?? "")) continue;
        if (table === "messages" && name === "text") continue;
        try {
          for (const row of this.client.prepare(`SELECT "${name}" AS v FROM "${table}" WHERE instr("${name}", '/uploads/') > 0`).iterate()) {
            addUploadRefs(into, (row as { v: unknown }).v);
          }
        } catch {
          // колонка не читается — пропускаем, как старый код
        }
      }
    }
  }

  /** Ссылки из расшифрованного текста сообщений. */
  public scanMessageTexts(into: Set<string>): void {
    try {
      for (const row of this.client.prepare("SELECT id, text FROM messages WHERE text <> ''").iterate()) {
        const { id, text } = row as { id: string; text: string };
        addUploadRefs(into, textCrypto().decryptText(id, text));
      }
    } catch {
      // как старый код: без текста сообщений
    }
  }

  /** Сообщения с вложениями старше cutoff — кандидаты «отдано и забыто». */
  public listDeliveredCandidates(cutoffIso: string): DeliveredRow[] | null {
    try {
      return this.client
        .prepare(
          `SELECT m.id, m.chatId, m.attachments, m.readByIds,
                  (SELECT count(*) FROM chat_members cm WHERE cm.chatId = m.chatId) AS members
             FROM messages m
            WHERE m.createdAt < ? AND m.attachments IS NOT NULL AND m.attachments <> '[]'`
        )
        .all(cutoffIso) as DeliveredRow[];
    } catch {
      return null;
    }
  }

  /** Вложения ещё нужных сообщений: новее cutoff или прочитанных не всеми. */
  public scanNeededAttachments(into: Set<string>, cutoffIso: string): void {
    this.scan(
      into,
      `SELECT m.attachments FROM messages m
        WHERE m.createdAt >= ?
           OR (SELECT count(*) FROM chat_members cm WHERE cm.chatId = m.chatId) >
              (SELECT count(*) FROM json_each(m.readByIds))`,
      ["attachments"],
      [cutoffIso]
    );
    this.scan(into, "SELECT sticker FROM messages WHERE sticker IS NOT NULL", ["sticker"]);
  }

  /** Превью и обложки вложений (thumbUrl, previewUrl, posterUrl). */
  public scanThumbnails(into: Set<string>): void {
    try {
      const rows = this.client
        .prepare("SELECT attachments FROM messages WHERE attachments LIKE '%thumbUrl%' OR attachments LIKE '%previewUrl%'")
        .all() as { attachments: string | null }[];
      for (const row of rows) {
        let list: { thumbUrl?: unknown; previewUrl?: unknown; posterUrl?: unknown }[] = [];
        try {
          list = JSON.parse(row.attachments || "[]");
        } catch {
          continue;
        }
        for (const a of list) {
          for (const value of [a?.thumbUrl, a?.previewUrl, a?.posterUrl]) {
            const m = String(value ?? "").match(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/);
            if (m) into.add(m[1]!);
          }
        }
      }
    } catch {
      // как старый код
    }
  }

  private scan(into: Set<string>, query: string, columns: string[], params: unknown[] = []): void {
    try {
      for (const row of this.client.prepare(query).all(...params) as Record<string, unknown>[]) {
        for (const c of columns) addUploadRefs(into, row[c]);
      }
    } catch {
      // как старый код
    }
  }
}
