import { Module } from "@nestjs/common";
import { BotsModule } from "../bots/bots.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { SessionsModule } from "../sessions/sessions.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminAccessService } from "./admin-access.service.js";
import { AdminCatalogService } from "./admin-catalog.service.js";
import { AdminLegalService } from "./admin-legal.service.js";
import { AdminModerationService } from "./admin-moderation.service.js";
import { AdminServerService } from "./admin-server.service.js";
import { AdminController } from "./admin.controller.js";
import { DataExportsRepository } from "./data-exports.repository.js";
import { LabelsController } from "./labels.controller.js";
import { SafetyLabelsRepository } from "./safety-labels.repository.js";

// Админка (/api/admin): юридический отдел (поиск, выгрузка данных, журнал), модерация (жалобы,
// блокировки, метки, удаление аккаунтов, ботов и чатов, сброс пароля, каталог), списки меток и
// статусов, сервер и цены, разделы админов. Удаление чатов и ботов модерацией, нагрузка
// сервера, проверка почты и цены — в server/ через мост.
@Module({
  imports: [UsersModule, ChatsModule, MessagesModule, BotsModule, ReportsModule, ProfilesModule, SessionsModule],
  controllers: [AdminController, LabelsController],
  providers: [
    AdminAccessService,
    AdminLegalService,
    AdminModerationService,
    AdminCatalogService,
    AdminServerService,
    DataExportsRepository,
    SafetyLabelsRepository,
  ],
})
export class AdminModule {}
