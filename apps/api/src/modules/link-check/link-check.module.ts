import { Module } from "@nestjs/common";
import { LinkCheckController } from "./link-check.controller.js";
import { LinkCheckService } from "./link-check.service.js";

// Встроенный браузер: можно ли открыть страницу и режим чтения (/api/link-check).
@Module({
  controllers: [LinkCheckController],
  providers: [LinkCheckService],
})
export class LinkCheckModule {}
