import crypto from "node:crypto";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { createEncryptStream, fileCompression, serveUpload, storage, uploadLimits } from "../../legacy/legacy.js";
import { ALREADY_COMPRESSED_RE, safeExtension } from "./lib/upload-name.js";
import type { UploadResult } from "./model/domain.js";
import type { UploadQueryDto } from "./model/schemas/upload.schema.js";
import { UploadsRepository } from "./uploads.repository.js";

type StreamError = Error & { status?: number };

// Загрузка файла: тело запроса — сырые байты, они идут потоком в хранилище (диск или S3),
// по дороге шифруются и, если формат ещё не сжат, сжимаются. Шифрование, сжатие и само
// хранилище — в server/ (через мост), как и шифрование текста сообщений.
@Injectable()
export class UploadsService {
  public constructor(private readonly uploads: UploadsRepository) {}

  public limits() {
    const { UPLOAD_LIMITS, DEFAULT_LIMIT } = uploadLimits();
    return { limits: UPLOAD_LIMITS, defaultLimit: DEFAULT_LIMIT };
  }

  /** Тип файла уже проверен схемой. */
  public async receive(uid: string, req: Request, { kind, name, mimeType }: UploadQueryDto): Promise<UploadResult> {
    const limits = uploadLimits();

    const limit = limits.limitFor(kind);
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) throw new ApiError(413, limits.tooLargeError(kind));

    const id = `${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
    const filename = `${id}${safeExtension(name)}`;

    const store = storage();
    const { stream: out, done, abort, plain } = store.createWriteTarget(filename, { contentType: serveUpload().contentTypeFor(filename) });
    // В S3 с шифрованием на стороне хранилища файл пишется как есть: его отдаёт бакет.
    const cipher = plain ? null : createEncryptStream(path.join(process.cwd(), "data"), out);
    const sink = cipher ?? out;
    const digest = crypto.createHash("sha256");
    // Открытый файл в S3 не сжимаем: бакет отдаёт его байты как есть.
    const compression = fileCompression();
    const compressor = !plain && kind === "file" && !ALREADY_COMPRESSED_RE.test(safeExtension(name)) ? compression.compressStream(declared) : null;

    const discard = () => store.deleteObject(filename).catch(() => {});

    let written = 0;
    let aborted = false;
    try {
      await new Promise((resolve, reject) => {
        req.on("data", (chunk: Buffer) => {
          if (aborted) return;
          written += chunk.length;
          digest.update(chunk);
          if (written > limit) {
            aborted = true;
            abort();
            req.destroy();
            reject(Object.assign(new Error(limits.tooLargeError(kind)), { status: 413 }));
          }
        });
        req.on("aborted", () => {
          aborted = true;
          abort();
          reject(Object.assign(new Error("Загрузка прервана"), { status: 400 }));
        });
        req.on("error", reject);
        done().then(resolve, reject);
        if (cipher) {
          cipher.on("error", reject);
          cipher.pipe(out);
        }
        if (compressor) {
          sink.write(compression.MAGIC);
          compressor.on("error", reject);
          req.pipe(compressor).pipe(sink);
        } else {
          req.pipe(sink);
        }
      });
    } catch (err) {
      await discard();
      const e = err as StreamError;
      throw new ApiError(e.status ?? 500, e.message || "Не удалось загрузить файл");
    }

    if (written === 0) {
      await discard();
      throw new ApiError(400, "Пустой файл");
    }

    const hash = digest.digest("hex").slice(0, 16);
    const finalName = await store.finalizeDedup(filename, `sha_${hash}${safeExtension(name)}`);
    this.uploads.recordUploader(finalName, uid);

    return {
      url: `/uploads/${finalName}`,
      name,
      size: written,
      mimeType,
      kind,
    };
  }
}
