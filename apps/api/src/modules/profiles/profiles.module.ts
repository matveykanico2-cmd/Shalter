import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { ProfileEditService } from "./profile-edit.service.js";
import { ProfileNotifyService } from "./profile-notify.service.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesService } from "./profiles.service.js";

// Профили (/api/users): маршруты отдельно от модуля users, которым как слоем данных
// пользуются chats и messages, — профилю нужны и они.
@Module({
  imports: [UsersModule, ChatsModule, MessagesModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileEditService, ProfileNotifyService],
  exports: [ProfileNotifyService],
})
export class ProfilesModule {}
