import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { AvatarsService } from "./avatars.service.js";
import { AvatarsController, ProfileStatusController, ProfileTrackController } from "./profile-media.controller.js";
import { ProfileEditService } from "./profile-edit.service.js";
import { ProfileNotifyService } from "./profile-notify.service.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfileStatusService } from "./profile-status.service.js";
import { ProfileStatusesRepository } from "./profile-statuses.repository.js";
import { ProfileTrackService } from "./profile-track.service.js";
import { ProfilesService } from "./profiles.service.js";

// Профили (/api/users) и аватарки, статусы, музыка своего профиля: маршруты отдельно от модуля users, которым как слоем данных
// пользуются chats и messages, — профилю нужны и они.
@Module({
  imports: [UsersModule, ChatsModule, MessagesModule],
  controllers: [ProfilesController, AvatarsController, ProfileStatusController, ProfileTrackController],
  providers: [
    ProfilesService,
    ProfileEditService,
    ProfileNotifyService,
    AvatarsService,
    ProfileStatusService,
    ProfileStatusesRepository,
    ProfileTrackService,
  ],
  exports: [ProfileNotifyService],
})
export class ProfilesModule {}
