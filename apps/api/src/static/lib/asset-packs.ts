// Мелкие картинки из архивов server/assets/packs (scripts/pack-assets.js) по прежним
// адресам: /img/emoji/…, /gift-symbols/…, /gift-emoji/…, /tgs/… — то же, что
// server/lib/assetPacks.js. Кусок файла читается по смещению, архив в память не грузится.
// На боевом сервере эти адреса отдаёт nginx из public/dist/packs (распаковка при сборке).
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { REPO_ROOT } from "../../common/config/paths.js";

interface Pack {
  name: string;
  prefix: string;
}

interface OpenedPack {
  fd: number;
  /** Путь внутри архива → [смещение, длина]. */
  index: Record<string, [number, number]>;
  base: number;
  etag: string;
}

const PACKS: Pack[] = [
  { name: "emoji", prefix: "/img/emoji/" },
  { name: "gift-symbols", prefix: "/gift-symbols/" },
  { name: "gift-emoji", prefix: "/gift-emoji/" },
  { name: "tgs", prefix: "/tgs/" },
];
const PACK_DIR = path.join(REPO_ROOT, "server", "assets", "packs");

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".tgs": "application/gzip",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
};

const opened = new Map<string, OpenedPack | null>();

function openPack(pack: Pack): OpenedPack | null {
  if (opened.has(pack.name)) return opened.get(pack.name)!;
  let entry: OpenedPack | null = null;
  try {
    const fd = fs.openSync(path.join(PACK_DIR, `${pack.name}.pack`), "r");
    const lenBuf = Buffer.alloc(4);
    fs.readSync(fd, lenBuf, 0, 4, 0);
    const headLen = lenBuf.readUInt32LE(0);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 4);
    entry = { fd, index: JSON.parse(head.toString("utf8")), base: 4 + headLen, etag: `"${pack.name}-${fs.fstatSync(fd).mtimeMs.toString(36)}` };
  } catch {
    entry = null; // архива нет (локальная разработка без упаковки) — отдаст обычная раздача public/
  }
  opened.set(pack.name, entry);
  return entry;
}

export function assetPacks(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const pack = PACKS.find((p) => req.path.startsWith(p.prefix));
    if (!pack) return next();
    const entry = openPack(pack);
    let rel: string;
    try {
      rel = decodeURIComponent(req.path.slice(pack.prefix.length));
    } catch {
      return next();
    }
    // Только свои ключи индекса: «constructor» или «__proto__» — не файлы архива.
    const hit = entry && Object.hasOwn(entry.index, rel) ? entry.index[rel] : undefined;
    if (!hit) return next();
    const etag = `${entry!.etag}-${hit[0].toString(36)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.setHeader("Content-Type", TYPES[path.extname(rel).toLowerCase()] ?? "application/octet-stream");
    if (req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.setHeader("Content-Length", hit[1]);
    if (req.method === "HEAD") return void res.end();
    const buf = Buffer.alloc(hit[1]);
    fs.read(entry!.fd, buf, 0, hit[1], entry!.base + hit[0], (err) => (err ? next(err) : res.end(buf)));
  };
}
