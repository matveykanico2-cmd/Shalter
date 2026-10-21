import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { serveUpload } from "../../legacy/legacy.js";
import { FileAccessGuard } from "./guards/file-access.guard.js";

// Отдача файла: расшифровка, распаковка, Range и редирект в бакет — в server/lib/serveUpload.js,
// ответ пишет он сам.
@Controller("uploads")
@UseGuards(FileAccessGuard)
export class FilesController {
  // GET-маршрут Express отвечает и на HEAD (serveUpload тогда шлёт только заголовки).
  @Get(":filename")
  public serve(@Req() req: Request, @Res() res: Response) {
    return serveUpload().serveUpload()(req, res, () => {});
  }
}
