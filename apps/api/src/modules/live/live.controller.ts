import http from "node:http";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { LiveService } from "./live.service.js";
import {
  handSchema,
  liveMessageSchema,
  muteSchema,
  roleSchema,
  startLiveSchema,
  type HandDto,
  type LiveMessageDto,
  type MuteDto,
  type RoleDto,
  type StartLiveDto,
} from "./model/schemas/live.schema.js";

@Controller("api/live")
@UseGuards(AuthGuard)
export class LiveController {
  public constructor(private readonly live: LiveService) {}

  @Post()
  @HttpCode(200)
  public start(@Req() req: Request, @Body(new ZodValidationPipe(startLiveSchema)) dto: StartLiveDto) {
    return this.live.start(req.uid!, req.headers.host, dto);
  }

  @Get("chat/:chatId")
  public forChat(@Req() req: Request, @Param("chatId") chatId: string) {
    return this.live.forChat(req.uid!, chatId);
  }

  @Get(":id")
  public get(@Req() req: Request, @Param("id") id: string) {
    return this.live.get(req.uid!, id, req.headers.host);
  }

  /** Эфир из OBS для зрителей: прокси локального HTTP-FLV потока node-media-server. */
  @Get(":id/feed.flv")
  public feed(@Req() req: Request, @Param("id") id: string, @Res() res: Response): void {
    const url = this.live.feedUrl(req.uid!, id);
    const upstream = http.get(url, (feed) => {
      if (feed.statusCode !== 200) {
        feed.resume();
        if (!res.headersSent) res.status(503).json({ error: "Вещание не идёт" });
        return;
      }
      res.setHeader("Content-Type", "video/x-flv");
      res.setHeader("Cache-Control", "no-store, no-transform");
      feed.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.status(503).json({ error: "Вещание не идёт" });
      else res.end();
    });
    res.on("close", () => upstream.destroy());
  }

  @Post(":id/join")
  @HttpCode(200)
  public join(@Req() req: Request, @Param("id") id: string) {
    return this.live.join(req.uid!, id, req.headers.host);
  }

  @Post(":id/leave")
  @HttpCode(200)
  public leave(@Req() req: Request, @Param("id") id: string) {
    return this.live.leave(req.uid!, id);
  }

  @Post(":id/hand")
  @HttpCode(200)
  public hand(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(handSchema)) dto: HandDto) {
    return this.live.hand(req.uid!, id, dto);
  }

  @Post(":id/participants/:userId/role")
  @HttpCode(200)
  public setRole(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string, @Body(new ZodValidationPipe(roleSchema)) dto: RoleDto) {
    return this.live.setRole(req.uid!, id, userId, dto);
  }

  @Post(":id/participants/:userId/mute")
  @HttpCode(200)
  public mute(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string, @Body(new ZodValidationPipe(muteSchema)) dto: MuteDto) {
    return this.live.mute(req.uid!, id, userId, dto);
  }

  @Post(":id/stop")
  @HttpCode(200)
  public stop(@Req() req: Request, @Param("id") id: string) {
    return this.live.stop(req.uid!, id);
  }

  @Post(":id/messages")
  @HttpCode(200)
  public sendMessage(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(liveMessageSchema)) dto: LiveMessageDto) {
    return this.live.sendMessage(req.uid!, id, dto);
  }

  @Patch(":id/messages/:messageId")
  public editMessage(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(liveMessageSchema)) dto: LiveMessageDto,
  ) {
    return this.live.editMessage(req.uid!, id, messageId, dto);
  }

  @Delete(":id/messages/:messageId")
  public deleteMessage(@Req() req: Request, @Param("id") id: string, @Param("messageId") messageId: string) {
    return this.live.deleteMessage(req.uid!, id, messageId);
  }
}
