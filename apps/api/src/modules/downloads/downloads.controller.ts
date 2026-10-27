import { Controller, Get, Header, Query } from "@nestjs/common";
import { DownloadsService } from "./downloads.service.js";

// Без сессии: страницу /download открывают и до входа.
@Controller("api/downloads")
export class DownloadsController {
  public constructor(private readonly downloads: DownloadsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  public list() {
    return this.downloads.list();
  }

  @Get("latest")
  @Header("Cache-Control", "no-store")
  public latest(@Query("platform") platform: unknown) {
    return this.downloads.latest(platform);
  }
}
