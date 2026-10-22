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
import { PaidMediaRepository } from "./paid-media.repository.js";
import { PaidMediaService } from "./paid-media.service.js";
import { ScheduledDeliveryService } from "./scheduled-delivery.service.js";
import { ScheduledMessagesController } from "./scheduled-messages.controller.js";
import { ScheduledMessagesRepository } from "./scheduled-messages.repository.js";
import { ScheduledMessagesService } from "./scheduled-messages.service.js";
import { SummaryStore } from "./stores/summary.store.js";

// Сообщения чата (/api/chats/:id/messages) и отправка отложенных. Боты и фоновый процесс в
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
    ScheduledDeliveryService,
    ScheduledMessagesRepository,
    PaidMediaService,
    MessageAccessService,
    MessagesRepository,
    PaidMediaRepository,
    SummaryStore,
  ],
  exports: [MessagesRepository, PaidMediaRepository, MessageSendService],
})
export class MessagesModule {}
