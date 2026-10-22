import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { MiniAppsController } from "./mini-apps.controller.js";
import { MiniAppsService } from "./mini-apps.service.js";

// Хостинг мини-приложений ботов (/app/:username). Сами боты и их код — в server/ (/api/bots).
@Module({
  imports: [UsersModule],
  controllers: [MiniAppsController],
  providers: [MiniAppsService],
})
export class MiniAppsModule {}
