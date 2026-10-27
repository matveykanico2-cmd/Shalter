import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { patchSettingsSchema, type PatchSettingsDto } from "./model/schemas/settings.schema.js";
import { SettingsService } from "./settings.service.js";

// Настройки пользователя (/api/settings).
@Controller("api/settings")
@UseGuards(AuthGuard)
export class SettingsController {
  public constructor(private readonly settings: SettingsService) {}

  @Get()
  public get(@Req() req: Request) {
    return this.settings.get(req.uid!);
  }

  @Get("storage")
  public storage(@Req() req: Request) {
    return this.settings.storage(req.uid!);
  }

  @Patch()
  public update(@Req() req: Request, @Body(new ZodValidationPipe(patchSettingsSchema)) dto: PatchSettingsDto) {
    return this.settings.update(req.uid!, dto);
  }
}
