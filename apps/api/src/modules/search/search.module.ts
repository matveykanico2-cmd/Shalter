import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { SearchController } from "./search.controller.js";
import { SearchService } from "./search.service.js";

// Общий поиск (/api/search).
@Module({
  imports: [ChatsModule, MessagesModule, UsersModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
