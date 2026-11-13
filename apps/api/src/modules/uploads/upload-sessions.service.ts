import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Writable } from "node:stream";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { uploadLimits, uploadParts } from "../../legacy/legacy.js";
import type { UploadResult } from "./model/domain.js";
import type { UploadQueryDto } from "./model/schemas/upload.schema.js";
import { UploadsService } from "./uploads.service.js";

/** Сколько клиент шлёт за раз (подсказка; часть может быть меньше). */
export const CHUNK_SIZE = 4 * 1024 * 1024;
/** Больше за один PUT не принимаем. */
const MAX_CHUNK = 16 * 1024 * 1024;
/** Незавершённая сессия живёт сутки с последней части. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Живых сессий на пользователя; новая сверх этого вытесняет самую давнюю (брошенную). */
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
  /** Идущий PUT части: новая часть обрывает его (клиент уже бросил тот запрос). */
  current: { req: Request; done: Promise<unknown> } | null;
  completing: boolean;
};

const sessionDir = () => path.join(process.cwd(), "data", "upload-sessions");

/** Поток закрылся (данные, что были в пути, уже на диске или отброшены). */
const closed = (stream: Writable) => new Promise<void>((resolve) => (stream.closed ? resolve() : stream.once("close", () => resolve())));

/**
 * Загрузка частями с продолжением (большие файлы на плохой сети): обрыв посреди файла
 * больше не начинает его заново. Части копятся во временном файле, зашифрованные ключом
 * сессии (server/lib/uploadParts.js, ключ только в памяти — на диске нет открытых байтов).
 * Завершение отдаёт собранный файл тому же конвейеру, что обычная загрузка
 * (UploadsService.store): шифрование хранилища, сжатие, дедупликация. Перезапуск сервера
 * сессии забывает — клиент получает 404 и начинает файл заново.
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
    // Брошенные сессии (клиент ушёл, не отменив) не должны запирать новые загрузки: при лимите
    // уходит самая давняя из простаивающих.
    const mine = [...this.sessions.values()].filter((s) => s.uid === uid).sort((a, b) => a.touchedAt - b.touchedAt);
    if (mine.length >= MAX_SESSIONS_PER_USER) {
      const idle = mine.find((s) => !s.current && !s.completing);
      if (!idle) throw new ApiError(429, "Слишком много загрузок одновременно — дождитесь окончания");
      this.drop(idle.id);
    }
    fs.mkdirSync(sessionDir(), { recursive: true });
    const id = crypto.randomBytes(16).toString("hex");
    const { key, iv } = uploadParts().newPartKey();
    const session: Session = { id, uid, query, size, received: 0, key, iv, touchedAt: Date.now(), current: null, completing: false };
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
    if (s.completing) throw new ApiError(409, "Файл уже собирается", { received: s.received });
    // Прежний запрос части ещё висит (клиент оборвал его, сервер не заметил — смена сети):
    // обрываем его здесь, а не отвечаем 409, на которые клиент повторял бы без конца.
    if (s.current) {
      s.current.req.destroy();
      await s.current.done.catch(() => {});
    }
    if (!this.sessions.has(id)) throw new ApiError(404, "Загрузка не найдена — начните заново");
    if (offset !== s.received) throw new ApiError(409, "Часть не с того места", { received: s.received });
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && (declared > MAX_CHUNK || s.received + declared > s.size)) throw new ApiError(413, "Слишком большая часть");
    const done = this.write(s, req);
    s.current = { req, done };
    try {
      await done;
    } finally {
      if (s.current?.req === req) s.current = null;
      s.touchedAt = Date.now();
    }
    return { id, received: s.received, size: s.size };
  }

  private async write(s: Session, req: Request) {
    const out = fs.createWriteStream(this.partOf(s.id), { flags: "a" });
    const cipher = uploadParts().partCipherAt(s.key, s.iv, s.received);
    let got = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        req.on("data", (chunk: Buffer) => {
          got += chunk.length;
          if (got > MAX_CHUNK || s.received + got > s.size) {
            // Дальше не пишем, но тело дочитываем: соединение живо, и 413 дойдёт до клиента
            // (обрыв сокета клиент принял бы за сбой сети и повторял ту же часть).
            req.unpipe(cipher);
            req.resume();
            reject(new ApiError(413, "Слишком большая часть"));
          }
        });
        req.on("aborted", () => reject(new ApiError(400, "Загрузка прервана")));
        // Оборван сервером (новая часть пришла раньше) — destroy() без ошибки шлёт только close.
        req.on("close", () => {
          if (!req.readableEnded) reject(new ApiError(400, "Загрузка прервана"));
        });
        req.on("error", reject);
        out.on("error", reject);
        out.on("finish", resolve);
        req.pipe(cipher).pipe(out);
      });
    } catch (err) {
      // Дописанное до обрыва не считаем: ждём, пока поток закроется (запись в пути легла бы
      // после обрезки и сдвинула следующую часть), потом обрезаем до принятого.
      out.destroy();
      await closed(out);
      await fs.promises.truncate(this.partOf(s.id), s.received).catch(() => {});
      throw err instanceof ApiError ? err : new ApiError(500, "Не удалось сохранить часть файла");
    }
    s.received += got;
  }

  /** Всё пришло — файл в хранилище, как обычная загрузка. */
  public async complete(uid: string, id: string): Promise<UploadResult> {
    const s = this.own(uid, id);
    if (s.current || s.completing) throw new ApiError(409, "Часть ещё загружается", { received: s.received });
    if (s.received !== s.size) throw new ApiError(409, "Файл загружен не полностью", { received: s.received });
    s.completing = true;
    try {
      const plain = fs.createReadStream(this.partOf(id)).pipe(uploadParts().partCipherAt(s.key, s.iv, 0, "decipher"));
      const result = await this.uploads.store(uid, plain, s.query, s.size);
      this.drop(id);
      return result;
    } catch (err) {
      // Сбой хранилища (S3, диск) — части остаются, клиент повторит завершение, а не весь файл.
      // Отказ по существу (4xx) — сессия больше не нужна.
      const status = err instanceof ApiError ? err.getStatus() : 500;
      if (status < 500) this.drop(id);
      throw err;
    } finally {
      s.completing = false;
      s.touchedAt = Date.now();
    }
  }

  public cancel(uid: string, id: string) {
    const s = this.own(uid, id);
    s.current?.req.destroy();
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
    for (const s of this.sessions.values()) if (!s.current && !s.completing && now - s.touchedAt > SESSION_TTL_MS) this.drop(s.id);
  }
}
