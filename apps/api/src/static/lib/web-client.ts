// Клиент — сборка apps/web (npm run build: Vite + scripts/build.js сжимает файлы заранее и
// пишет build.json с версией). SHALTER_WEB_DIST — другая папка сборки (тесты, превью).
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../../common/config/paths.js";

export const WEB_DIST_DIR = process.env.SHALTER_WEB_DIST ? path.resolve(process.env.SHALTER_WEB_DIST) : path.join(REPO_ROOT, "apps", "web", "dist");

export const WEB_INDEX_HTML = path.join(WEB_DIST_DIR, "index.html");

/** Есть ли сборка клиента; без неё страницы приложения отвечают 503 с подсказкой. */
export const webClientBuilt = () => fs.existsSync(WEB_INDEX_HTML);
