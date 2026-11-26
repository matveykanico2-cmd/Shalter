import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./http";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_BYTES = 100 * 1024 * 1024;

export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
};

export type SavedMedia = { url: string; kind: "image" | "video" };

export type SavedVoice = { url: string; kind: "audio" };

export async function saveUpload(file: File, allow: "image" | "any" = "any"): Promise<SavedMedia> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new HttpError(400, "This file type isn't supported. Use a photo or an MP4/WebM/MOV video.");
  const kind = file.type.startsWith("video/") ? "video" : "image";
  if (allow === "image" && kind !== "image") throw new HttpError(400, "Please choose a photo.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "File is too large (100 MB max).");

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomBytes(12).toString("hex") + ext;
  await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/api/media/${name}`, kind };
}

export async function saveVoiceUpload(file: File): Promise<SavedVoice> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext || !file.type.startsWith("audio/")) throw new HttpError(400, "Record a supported audio message.");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(400, "Voice message is too large.");
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomBytes(12).toString("hex") + ext;
  await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/api/media/${name}?audio=1`, kind: "audio" };
}

export async function deleteUpload(url: string | null | undefined) {
  if (!url?.startsWith("/api/media/")) return;
  const name = path.basename(url);
  await fs.rm(path.join(UPLOAD_DIR, name), { force: true });
}
