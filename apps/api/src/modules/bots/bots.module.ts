import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { GamesModule } from "../games/games.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { BotApiAccessService } from "./bot-api-access.service.js";
import { BotApiChatsController } from "./bot-api-chats.controller.js";
import { BotApiChatsService } from "./bot-api-chats.service.js";
import { BotApiMessagesController } from "./bot-api-messages.controller.js";
import { BotApiMessagesService } from "./bot-api-messages.service.js";
import { BotApiProfileController } from "./bot-api-profile.controller.js";
import { BotApiProfileService } from "./bot-api-profile.service.js";
import { BotsController } from "./bots.controller.js";
import { BotsRepository } from "./bots.repository.js";
import { BotsService } from "./bots.service.js";
import { BotTokenGuard } from "./guards/bot-token.guard.js";
import { BroadcastCooldownStore } from "./stores/broadcast-cooldown.store.js";
import { NewDialogsStore } from "./stores/new-dialogs.store.js";

// Боты: свои боты пользователя (/api/bots) и Bot API по токену бота (/api/bot-api). Песочница
// кода ботов и sendBotMessage (с ответами других ботов) — пока в server/.
@Module({
  imports: [UsersModule, ChatsModule, MessagesModule, GamesModule],
  controllers: [BotsController, BotApiMessagesController, BotApiChatsController, BotApiProfileController],
  providers: [
    BotsService,
    BotsRepository,
    BroadcastCooldownStore,
    BotTokenGuard,
    BotApiAccessService,
    BotApiMessagesService,
    BotApiChatsService,
    BotApiProfileService,
    NewDialogsStore,
  ],
  exports: [BotsRepository],
})
export class BotsModule {}
