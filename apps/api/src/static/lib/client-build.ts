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
