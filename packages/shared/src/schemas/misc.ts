// Мелкие публичные и служебные маршруты: «Поделиться» (routes/shareTarget.js +
// /api/share/:token в index.js), короткие ссылки (/s/:code, /api/short-links),
// собственный экспорт (routes/export.js), сборки (routes/downloads.js), /api/version.
import { z } from "zod";
import { isoDate } from "./common";
import { selfUserExport } from "./admin";

/** Содержимое из системного меню «Поделиться», выдаётся один раз по токену. */
export const sharePayload = z.strictObject({
  text: z.string(),
  url: z.string().nullable(),
  file: z.strictObject({ name: z.string(), type: z.string(), base64: z.string() }).nullable(),
});
export const shareBody = z.strictObject({ share: sharePayload });

export const shortLinksCount = z.strictObject({ total: z.number().int(), thisMonth: z.number().int() });

/** GET /api/export — тот же построитель, что у юристов (data/dataExport.js), но про себя. */
export const selfExportBody = z.strictObject({ data: selfUserExport });

export const DOWNLOAD_IDS = ["windows", "android", "linux", "linux-deb", "macos-arm64"] as const;
export const downloadArtifact = z.union([
  z.strictObject({ id: z.enum(DOWNLOAD_IDS), available: z.literal(false) }),
  z.strictObject({ id: z.enum(DOWNLOAD_IDS), available: z.literal(true), url: z.string(), size: z.number().int().positive(), updatedAt: isoDate }),
]);
export const downloadsBody = z.strictObject({ version: z.string(), artifacts: z.array(downloadArtifact) });

/** GET /api/downloads/latest: нет версии — { version: null }. */
export const latestBody = z.union([
  z.strictObject({ version: z.null() }),
  z.strictObject({ version: z.string(), url: z.string().nullable(), page: z.literal("/download") }),
  // Своя сборка из public/downloads с версией из versions.json.
  z.strictObject({ version: z.string(), url: z.string(), size: z.number().int(), page: z.literal("/download") }),
]);

export const versionBody = z.strictObject({ version: z.string(), startedAt: isoDate });
