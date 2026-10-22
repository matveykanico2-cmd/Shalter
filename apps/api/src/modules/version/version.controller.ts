import fs from "node:fs";
import path from "node:path";
import { Controller, Get, Header } from "@nestjs/common";
import { PUBLIC_DIR } from "../../common/config/paths.js";

const BUILD_JSON = path.join(PUBLIC_DIR, "dist", "build.json");
const STARTED_AT = new Date().toISOString();

// Версия клиента и время старта процесса (GET /api/version в server/app.js): по ним клиент
// замечает новую сборку. Без сессии.
@Controller("api/version")
export class VersionController {
  @Get()
  @Header("Cache-Control", "no-store")
  public get() {
    let version = "dev";
    try {
      if (fs.existsSync(BUILD_JSON)) version = JSON.parse(fs.readFileSync(BUILD_JSON, "utf-8")).version ?? "dev";
    } catch {
      // нет сборки или битый файл — dev
    }
    return { version, startedAt: STARTED_AT };
  }
}
