import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { CommunitiesController } from "./communities.controller.js";
import { CommunitiesRepository } from "./communities.repository.js";
import { CommunitiesService } from "./communities.service.js";
import { CommunityAccessService } from "./community-access.service.js";
import { CommunityAdminsService } from "./community-admins.service.js";
import { CommunityChatsService } from "./community-chats.service.js";

// Сообщества (/api/communities): группы и каналы под одной вывеской, со своим членством,
// администраторами, удалёнными участниками и заявками на добавление чатов.
@Module({
  imports: [ChatsModule, MessagesModule, UsersModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService, CommunityChatsService, CommunityAdminsService, CommunityAccessService, CommunitiesRepository],
})
export class CommunitiesModule {}
