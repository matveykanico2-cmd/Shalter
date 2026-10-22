import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { aiSettingsSchema, stopSchema, type AiSettingsDto, type StopDto } from "./model/schemas/shalter-ai.schema.js";
import { ShalterAiService } from "./shalter-ai.service.js";

@Controller("api/ai")
@UseGuards(AuthGuard)
export class ShalterAiController {
  public constructor(private readonly ai: ShalterAiService) {}

  @Post("chat")
  @HttpCode(200)
  public chat(@Req() req: Request) {
    return this.ai.chat(req.uid!);
  }

  @Get("settings")
  public settings(@Req() req: Request) {
    return this.ai.state(req.uid!);
  }

  @Patch("settings")
  public updateSettings(@Req() req: Request, @Body(new ZodValidationPipe(aiSettingsSchema)) dto: AiSettingsDto) {
    return this.ai.updateSettings(req.uid!, dto);
  }

  @Post("stop")
  @HttpCode(200)
  public stop(@Req() req: Request, @Body(new ZodValidationPipe(stopSchema)) dto: StopDto) {
    return this.ai.stop(req.uid!, dto.chatId);
  }
}
