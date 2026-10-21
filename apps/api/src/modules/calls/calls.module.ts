import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { UsersModule } from "../users/users.module.js";
import { CallNotifyService } from "./call-notify.service.js";
import { CallParticipantsService } from "./call-participants.service.js";
import { CallSignalsService } from "./call-signals.service.js";
import { CallsController } from "./calls.controller.js";
import { CallsRepository } from "./calls.repository.js";
import { CallsService } from "./calls.service.js";
import { SignalsRepository } from "./signals.repository.js";
import { VoiceRoomsService } from "./voice-rooms.service.js";

// Звонки и голосовые чаты групп (/api/calls). Шлюзу WS нужен CallSignalsService: сигналы
// по сокету (call:signal:send) проверяются и сохраняются так же, как по HTTP.
@Module({
  imports: [ChatsModule, UsersModule],
  controllers: [CallsController],
  providers: [CallsService, CallParticipantsService, VoiceRoomsService, CallSignalsService, CallNotifyService, CallsRepository, SignalsRepository],
  exports: [CallSignalsService],
})
export class CallsModule {}
