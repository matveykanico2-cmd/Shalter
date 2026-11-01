import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { UiLanguageService } from "./ui-language.service.js";

// GET /api/geo/language — язык интерфейса для этого клиента, без входа (экраны входа и регистрации).
@Controller("api/geo")
export class UiLanguageController {
  public constructor(private readonly uiLanguage: UiLanguageService) {}

  @Get("language")
  public language(@Req() req: Request) {
    return this.uiLanguage.detect(req);
  }
}
