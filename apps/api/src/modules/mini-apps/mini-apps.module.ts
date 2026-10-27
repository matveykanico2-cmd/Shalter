import { Module } from "@nestjs/common";
import { BotsModule } from "../bots/bots.module.js";
import { UsersModule } from "../users/users.module.js";
import { MiniAppsController } from "./mini-apps.controller.js";
import { MiniAppsService } from "./mini-apps.service.js";

// Хостинг мини-приложений ботов (/app/:username). Сами боты — в modules/bots.
@Module({
  imports: [UsersModule, BotsModule],
  controllers: [MiniAppsController],
  providers: [MiniAppsService],
})
export class MiniAppsModule {}
