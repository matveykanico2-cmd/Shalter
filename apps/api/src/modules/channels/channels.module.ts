import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { ChannelsController } from "./channels.controller.js";
import { ChannelsService } from "./channels.service.js";

// Каталог каналов, похожие, подписка и статистика (/api/channels). Остальное про каналы — в /api/chats.
@Module({
  imports: [ChatsModule, MessagesModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
