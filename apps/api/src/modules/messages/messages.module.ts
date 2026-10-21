import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { TopicsModule } from "../topics/topics.module.js";
import { UsersModule } from "../users/users.module.js";
import { MessageAccessService } from "./message-access.service.js";
import { MessageActionsController } from "./message-actions.controller.js";
import { MessageActionsService } from "./message-actions.service.js";
import { MessageSendService } from "./message-send.service.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesRepository } from "./messages.repository.js";
import { MessagesService } from "./messages.service.js";
import { PaidMediaController } from "./paid-media.controller.js";
import { PaidMediaService } from "./paid-media.service.js";
import { ScheduledMessagesController } from "./scheduled-messages.controller.js";
import { ScheduledMessagesService } from "./scheduled-messages.service.js";
import { SummaryStore } from "./stores/summary.store.js";

// Сообщения чата (/api/chats/:id/messages). Боты, посты, отложенные и фоновый процесс в
// server/ пишут в ту же таблицу через server/data/messages.js.
// ScheduledMessagesController первым: scheduled/… не должен совпасть с /:messageId/….
@Module({
  imports: [ChatsModule, TopicsModule, UsersModule],
  controllers: [ScheduledMessagesController, MessagesController, PaidMediaController, MessageActionsController],
  providers: [
    MessagesService,
    MessageSendService,
    MessageActionsService,
    ScheduledMessagesService,
    PaidMediaService,
    MessageAccessService,
    MessagesRepository,
    SummaryStore,
  ],
})
export class MessagesModule {}
