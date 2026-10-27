import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { CallParticipantsService } from "./call-participants.service.js";
import { CallSignalsService } from "./call-signals.service.js";
import { CallsService } from "./calls.service.js";
import {
  addParticipantSchema,
  createCallSchema,
  patchCallSchema,
  sendSignalSchema,
  signalsQuerySchema,
  type AddParticipantDto,
  type CreateCallDto,
  type PatchCallDto,
  type SendSignalDto,
  type SignalsQueryDto,
} from "./model/schemas/call.schema.js";
import { VoiceRoomsService } from "./voice-rooms.service.js";

// Звонки (/api/calls). Порядок методов — как у server/routes/calls.js: room/… и join/… идут
// после /:id/answer, /:id/participants и /:id/leave, как и там.
@Controller("api/calls")
@UseGuards(AuthGuard)
export class CallsController {
  public constructor(
    private readonly calls: CallsService,
    private readonly participants: CallParticipantsService,
    private readonly rooms: VoiceRoomsService,
    private readonly signals: CallSignalsService
  ) {}

  @Get("ice-servers")
  public iceServers() {
    return this.calls.iceServers();
  }

  @Get()
  public history(@Req() req: Request) {
    return this.calls.history(req.uid!);
  }

  @Post()
  @HttpCode(200)
  public create(@Req() req: Request, @Body(new ZodValidationPipe(createCallSchema)) dto: CreateCallDto) {
    return this.calls.create(req.uid!, dto);
  }

  @Patch(":id")
  public patch(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(patchCallSchema)) dto: PatchCallDto) {
    return this.calls.patch(req.uid!, id, dto);
  }

  @Post(":id/answer")
  @HttpCode(200)
  public answer(@Req() req: Request, @Param("id") id: string) {
    return this.calls.answer(req.uid!, id);
  }

  @Post(":id/participants")
  @HttpCode(200)
  public addParticipant(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(addParticipantSchema)) dto: AddParticipantDto) {
    return this.participants.add(req.uid!, id, dto);
  }

  @Post(":id/leave")
  @HttpCode(200)
  public leave(@Req() req: Request, @Param("id") id: string) {
    return this.calls.leaveById(req.uid!, id);
  }

  @Delete(":id/participants/:userId")
  public removeParticipant(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string) {
    return this.participants.remove(req.uid!, id, userId);
  }

  @Get("room/:chatId")
  public room(@Req() req: Request, @Param("chatId") chatId: string) {
    return this.rooms.room(req.uid!, chatId);
  }

  @Post("room/:chatId/join")
  @HttpCode(200)
  public joinRoom(@Req() req: Request, @Param("chatId") chatId: string) {
    return this.rooms.join(req.uid!, chatId);
  }

  @Post("room/:chatId/leave")
  @HttpCode(200)
  public leaveRoom(@Req() req: Request, @Param("chatId") chatId: string) {
    return this.rooms.leave(req.uid!, chatId);
  }

  @Post(":id/invite-link")
  @HttpCode(200)
  public inviteLink(@Req() req: Request, @Param("id") id: string) {
    return this.participants.inviteLink(req.uid!, id, `${req.protocol}://${req.get("host")}`);
  }

  @Post("join/:token")
  @HttpCode(200)
  public join(@Req() req: Request, @Param("token") token: string) {
    return this.participants.join(req.uid!, token);
  }

  @Get(":id/signal")
  public listSignals(@Req() req: Request, @Param("id") id: string, @Query(new ZodValidationPipe(signalsQuerySchema)) query: SignalsQueryDto) {
    return this.signals.list(req.uid!, id, query);
  }

  @Post(":id/signal")
  @HttpCode(200)
  public sendSignal(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(sendSignalSchema)) dto: SendSignalDto) {
    return this.signals.send(req.uid!, id, dto);
  }
}
