// Собранная версия клиента (public/dist, scripts/build.js) — как в server/app.js: при
// старте устаревшая сборка пересобирается, а без сборки (USE_BUILD=0 или её нет)
// клиент отдаётся исходниками из public/.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PUBLIC_DIR, REPO_ROOT } from "../../common/config/paths.js";

const require = createRequire(import.meta.url);
const BUILD_SCRIPT = path.join(REPO_ROOT, "scripts", "build.js");

export const DIST_DIR = path.join(PUBLIC_DIR, "dist");

/** Пересобрать клиента, если исходники новее сборки; true — отдавать собранную версию. */
export function prepareClientBuild(): boolean {
  if (process.env.USE_BUILD === "0") return false;
  try {
    const builder = require(BUILD_SCRIPT) as { isStale: () => boolean };
    if (builder.isStale()) {
      console.log("[static] собранная версия устарела — пересобираю…");
      const started = Date.now();
      execFileSync(process.execPath, [BUILD_SCRIPT], { stdio: "inherit" });
      console.log(`[static] сборка готова за ${Date.now() - started} мс`);
    }
  } catch (err) {
    console.error("[static] пересобрать не удалось, отдаю что есть:", (err as Error).message);
  }
  return fs.existsSync(path.join(DIST_DIR, "index.html"));
}

/** Новый клиент (этап 4): сборка apps/web, npm run build:web; SHALTER_WEB_DIST — другая папка сборки. */
export const WEB_DIST_DIR = process.env.SHALTER_WEB_DIST ? path.resolve(process.env.SHALTER_WEB_DIST) : path.join(REPO_ROOT, "apps", "web", "dist");

/** SHALTER_CLIENT=web — отдавать apps/web вместо public/ (index.html и его сборку). */
export function useWebClient(): boolean {
  if (process.env.SHALTER_CLIENT !== "web") return false;
  if (fs.existsSync(path.join(WEB_DIST_DIR, "index.html"))) return true;
  console.error("[static] SHALTER_CLIENT=web, но нет apps/web/dist — сначала npm run build:web; отдаю public/");
  return false;
}
