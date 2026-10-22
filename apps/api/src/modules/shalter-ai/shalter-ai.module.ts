import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { ShalterAiController } from "./shalter-ai.controller.js";
import { ShalterAiService } from "./shalter-ai.service.js";

// Shalter AI: чат, настройки ответов и остановка (/api/ai).
@Module({
  imports: [UsersModule, MessagesModule],
  controllers: [ShalterAiController],
  providers: [ShalterAiService],
})
export class ShalterAiModule {}
