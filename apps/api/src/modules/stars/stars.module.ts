import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { StarsController } from "./stars.controller.js";
import { StarsService } from "./stars.service.js";

// Звёзды (/api/stars): маршруты. Баланс и списания — StarsRepository из модуля users:
// за звёзды платят и в сообщениях, и в звонках.
@Module({
  imports: [UsersModule, ChatsModule, MessagesModule],
  controllers: [StarsController],
  providers: [StarsService],
})
export class StarsModule {}
