import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { UsersModule } from "../users/users.module.js";
import { StoriesController } from "./stories.controller.js";
import { StoriesRepository } from "./stories.repository.js";
import { StoriesService } from "./stories.service.js";
import { StoryAudienceService } from "./story-audience.service.js";

// Истории (/api/stories). Видео истории перекодирует фоновый процесс (modules/background).
@Module({
  imports: [ChatsModule, UsersModule],
  controllers: [StoriesController],
  providers: [StoriesService, StoryAudienceService, StoriesRepository],
  exports: [StoriesRepository, StoryAudienceService],
})
export class StoriesModule {}
