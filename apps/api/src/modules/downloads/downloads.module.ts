import { Module } from "@nestjs/common";
import { DownloadsController } from "./downloads.controller.js";
import { DownloadsService } from "./downloads.service.js";
import { ReleaseStore } from "./stores/release.store.js";

// Сборки приложения (/api/downloads): локальные из public/downloads и последний релиз на GitHub.
@Module({
  controllers: [DownloadsController],
  providers: [DownloadsService, ReleaseStore],
})
export class DownloadsModule {}
