import { Module } from "@nestjs/common";
import { ExportController } from "./export.controller.js";
import { ExportService } from "./export.service.js";

// Экспорт своих данных (/api/export).
@Module({
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
