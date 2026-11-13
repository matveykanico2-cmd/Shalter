import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { uploadLimits } from "../../legacy/legacy.js";
import { ctrAt } from "./lib/ctr.js";
import type { UploadResult } from "./model/domain.js";
import type { UploadQueryDto } from "./model/schemas/upload.schema.js";
import { UploadsService } from "./uploads.service.js";

/** Сколько клиент шлёт за раз (подсказка; часть может быть меньше). */
export const CHUNK_SIZE = 4 * 1024 * 1024;
/** Больше за один PUT не принимаем. */
const MAX_CHUNK = 16 * 1024 * 1024;
/** Незавершённая сессия живёт сутки с последней части. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 20;

type Session = {
  id: string;
  uid: string;
  query: UploadQueryDto;
  size: number;
  received: number;
  key: Buffer;
  iv: Buffer;
  touchedAt: number;
  busy: boolean;
};

const sessionDir = () => path.join(process.cwd(), "data", "upload-sessions");

/**
 * Загрузка частями с продолжением (большие файлы на плохой сети): обрыв посреди файла
 * больше не начинает его заново. Части копятся во временном файле, зашифрованные ключом
 * сессии (AES-256-CTR, ключ только в памяти — на диске нет открытых байтов). Завершение
 * отдаёт собранный файл тому же конвейеру, что обычная загрузка (UploadsService.store):
 * шифрование хранилища, сжатие, дедупликация. Перезапуск сервера сессии забывает — клиент
 * получает 404 и начинает файл заново.
 */
@Injectable()
export class UploadSessionsService implements OnModuleDestroy {
  private readonly sessions = new Map<string, Session>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  public constructor(private readonly uploads: UploadsService) {
    // Части прошлого запуска уже не расшифровать — убираем.
    fs.rmSync(sessionDir(), { recursive: true, force: true });
    this.sweeper = setInterval(() => this.sweep(), 60 * 60 * 1000);
    this.sweeper.unref();
  }

  public onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  public create(uid: string, query: UploadQueryDto, size: number) {
    const limits = uploadLimits();
    if (!Number.isSafeInteger(size) || size <= 0) throw new ApiError(400, "Пустой файл");
    if (size > limits.limitFor(query.kind)) throw new ApiError(413, limits.tooLargeError(query.kind));
    this.sweep();
    if ([...this.sessions.values()].filter((s) => s.uid === uid).length >= MAX_SESSIONS_PER_USER) {
      throw new ApiError(429, "Слишком много незавершённых загрузок — дождитесь окончания");
    }
    fs.mkdirSync(sessionDir(), { recursive: true });
    const id = crypto.randomBytes(16).toString("hex");
    const session: Session = { id, uid, query, size, received: 0, key: crypto.randomBytes(32), iv: crypto.randomBytes(16), touchedAt: Date.now(), busy: false };
    fs.writeFileSync(this.partOf(id), Buffer.alloc(0));
    this.sessions.set(id, session);
    return { id, received: 0, size, chunkSize: CHUNK_SIZE };
  }

  public status(uid: string, id: string) {
    const s = this.own(uid, id);
    return { id, received: s.received, size: s.size, chunkSize: CHUNK_SIZE };
  }

  /** Часть с offset: offset должен совпасть с принятым (иначе 409 и сколько принято). */
  public async append(uid: string, id: string, offset: number, req: Request) {
    const s = this.own(uid, id);
    if (s.busy) throw new ApiError(409, "Эта часть уже загружается", { received: s.received });
    if (offset !== s.received) throw new ApiError(409, "Часть не с того места", { received: s.received });
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && (declared > MAX_CHUNK || s.received + declared > s.size)) throw new ApiError(413, "Слишком большая часть");
    s.busy = true;
    const out = fs.createWriteStream(this.partOf(id), { flags: "a" });
    const cipher = ctrAt(s.key, s.iv, s.received);
    let got = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        req.on("data", (chunk: Buffer) => {
          got += chunk.length;
          if (got > MAX_CHUNK || s.received + got > s.size) {
            req.destroy();
            reject(new ApiError(413, "Слишком большая часть"));
          }
        });
        req.on("aborted", () => reject(new ApiError(400, "Загрузка прервана")));
        req.on("error", reject);
        out.on("error", reject);
        out.on("finish", resolve);
        req.pipe(cipher).pipe(out);
      });
    } catch (err) {
      out.destroy();
      // Дописанное до обрыва не считаем: файл обрезаем до принятого, клиент повторит часть.
      await fs.promises.truncate(this.partOf(id), s.received).catch(() => {});
      throw err instanceof ApiError ? err : new ApiError(500, "Не удалось сохранить часть файла");
    } finally {
      s.busy = false;
      s.touchedAt = Date.now();
    }
    s.received += got;
    return { id, received: s.received, size: s.size };
  }

  /** Всё пришло — файл в хранилище, как обычная загрузка. */
  public async complete(uid: string, id: string): Promise<UploadResult> {
    const s = this.own(uid, id);
    if (s.busy) throw new ApiError(409, "Часть ещё загружается", { received: s.received });
    if (s.received !== s.size) throw new ApiError(409, "Файл загружен не полностью", { received: s.received });
    s.busy = true;
    try {
      const plain = fs.createReadStream(this.partOf(id)).pipe(ctrAt(s.key, s.iv, 0, "decipher"));
      return await this.uploads.store(uid, plain, s.query, s.size);
    } finally {
      this.drop(id);
    }
  }

  public cancel(uid: string, id: string) {
    this.own(uid, id);
    this.drop(id);
    return { ok: true };
  }

  private own(uid: string, id: string) {
    const s = this.sessions.get(id);
    if (!s || s.uid !== uid || Date.now() - s.touchedAt > SESSION_TTL_MS) throw new ApiError(404, "Загрузка не найдена — начните заново");
    return s;
  }

  private partOf(id: string) {
    return path.join(sessionDir(), `${id}.part`);
  }

  private drop(id: string) {
    this.sessions.delete(id);
    fs.rm(this.partOf(id), { force: true }, () => {});
  }

  private sweep() {
    const now = Date.now();
    for (const s of this.sessions.values()) if (!s.busy && now - s.touchedAt > SESSION_TTL_MS) this.drop(s.id);
  }
}
