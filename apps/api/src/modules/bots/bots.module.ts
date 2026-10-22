import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { UsersModule } from "../users/users.module.js";
import { BotsController } from "./bots.controller.js";
import { BotsRepository } from "./bots.repository.js";
import { BotsService } from "./bots.service.js";
import { BroadcastCooldownStore } from "./stores/broadcast-cooldown.store.js";

// Боты пользователя (/api/bots). Bot API по токену, песочница кода ботов и их сообщения — пока в server/.
@Module({
  imports: [UsersModule, ChatsModule],
  controllers: [BotsController],
  providers: [BotsService, BotsRepository, BroadcastCooldownStore],
  exports: [BotsRepository],
})
export class BotsModule {}
