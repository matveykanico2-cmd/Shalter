// Загрузка и скачивание файлов как это делает клиент: тело POST /api/uploads —
// сырые байты файла (не multipart), имя/вид/тип — в query.
import { randomBytes } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import type { Api, ApiResponse } from "../../support/client";

export interface UploadOptions {
  kind?: string;
  name?: string;
  mimeType?: string;
}

export function upload(api: Api, bytes: Uint8Array, opts: UploadOptions = {}): Promise<ApiResponse> {
  return api.request("POST", "/api/uploads", {
    query: { kind: opts.kind, name: opts.name, mimeType: opts.mimeType },
    headers: { "content-type": "application/octet-stream" },
    body: new Blob([new Uint8Array(bytes)]),
  });
}

export interface Download {
  status: number;
  headers: Headers;
  bytes: Buffer;
}

/** GET/HEAD файла с cookie этого клиента; тело — байты, а не текст. */
export async function download(api: Api | null, url: string, init: { method?: string; headers?: Record<string, string> } = {}): Promise<Download> {
  const headers: Record<string, string> = { ...init.headers };
  const base = api?.baseUrl ?? "";
  if (api) {
    const cookie = api.cookieHeader();
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(new URL(url, base), { method: init.method ?? "GET", headers, redirect: "manual" });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}

/**
 * Валидный PNG side×side (по умолчанию 2×2) со случайными цветами пикселей: одинаковые
 * файлы сервер хранит один раз (sha_…), а доступ к файлу привязан к чатам — каждому тесту
 * нужен свой файл.
 */
export function uniquePng(side = 2): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0); // ширина
  ihdr.writeUInt32BE(side, 4); // высота
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  // Каждая строка: байт фильтра 0 и side пикселей RGBA.
  const raw = Buffer.concat(Array.from({ length: side }, () => Buffer.concat([Buffer.from([0]), randomBytes(side * 4)])));
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function uniqueText(size = 64): Buffer {
  return Buffer.from(`файл ${randomBytes(8).toString("hex")} `.padEnd(size, "x"));
}
