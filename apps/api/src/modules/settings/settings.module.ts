import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { NearbyModule } from "../nearby/nearby.module.js";
import { UsersModule } from "../users/users.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

// Настройки (/api/settings): маршруты. Сами настройки читает и пишет UserSettingsService
// из модуля users — ими пользуются и чаты, и сообщения.
@Module({
  imports: [UsersModule, ChatsModule, MessagesModule, NearbyModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
