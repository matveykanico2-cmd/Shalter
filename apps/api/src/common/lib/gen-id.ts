import { randomBytes } from "node:crypto";

// Тот же формат, что у server/lib/genId.js: префикс_время36 + 10 hex-символов.
export const genId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
