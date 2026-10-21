import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AdminLogRepository } from "./admin-log.repository.js";
import { AdminLogService } from "./admin-log.service.js";
import { ChatAccessService } from "./chat-access.service.js";
import { ChatAdminController } from "./chat-admin.controller.js";
import { ChatAdminService } from "./chat-admin.service.js";
import { ChatLinksController } from "./chat-links.controller.js";
import { ChatLinksService } from "./chat-links.service.js";
import { ChatMembersController } from "./chat-members.controller.js";
import { ChatMembersService } from "./chat-members.service.js";
import { ChatNotesService } from "./chat-notes.service.js";
import { ChatsController } from "./chats.controller.js";
import { ChatsRepository } from "./chats.repository.js";
import { ChatsService } from "./chats.service.js";
import { JoinRequestsRepository } from "./join-requests.repository.js";

// Чаты (/api/chats). Сообщения и темы (/api/chats/:id/messages, /:id/topics) пока в server/.
// ChatLinksController первым: его by-username/… и invite/… не должны совпасть с /:id/….
@Module({
  imports: [UsersModule],
  controllers: [ChatLinksController, ChatsController, ChatMembersController, ChatAdminController],
  providers: [
    ChatsService,
    ChatAdminService,
    ChatMembersService,
    ChatLinksService,
    ChatAccessService,
    ChatNotesService,
    AdminLogService,
    ChatsRepository,
    JoinRequestsRepository,
    AdminLogRepository,
  ],
})
export class ChatsModule {}
