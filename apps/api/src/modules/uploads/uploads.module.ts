import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller.js";
import { FileAccessGuard } from "./guards/file-access.guard.js";
import { UploadsController } from "./uploads.controller.js";
import { UploadsRepository } from "./uploads.repository.js";
import { UploadsService } from "./uploads.service.js";

// Файлы: загрузка (/api/uploads) и отдача (/uploads/:filename).
@Module({
  controllers: [UploadsController, FilesController],
  providers: [UploadsService, UploadsRepository, FileAccessGuard],
})
export class UploadsModule {}
