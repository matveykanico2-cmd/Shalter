import path from "node:path";

// Корень репозитория: отсюда (src/common/config или dist/common/config) — пять уровней вверх.
export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");

/** Статика клиента: public/ (там же сборки приложения в public/downloads). */
export const PUBLIC_DIR = path.join(REPO_ROOT, "public");
