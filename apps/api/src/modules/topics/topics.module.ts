import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { TopicsController } from "./topics.controller.js";
import { TopicsRepository } from "./topics.repository.js";
import { TopicsService } from "./topics.service.js";

// Темы групп (/api/chats/:id/topics). Сообщениям нужен TopicsRepository: писать можно только
// в существующую тему, в закрытую — только админам.
@Module({
  imports: [ChatsModule],
  controllers: [TopicsController],
  providers: [TopicsService, TopicsRepository],
  exports: [TopicsRepository],
})
export class TopicsModule {}
