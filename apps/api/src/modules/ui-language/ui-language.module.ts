import { Module } from "@nestjs/common";
import { NearbyModule } from "../nearby/nearby.module.js";
import { UsersModule } from "../users/users.module.js";
import { UiLanguageController } from "./ui-language.controller.js";
import { UiLanguageService } from "./ui-language.service.js";

// Язык интерфейса по стране IP (/api/geo/language) и автоматический режим языка в настройках:
// регистрация, вход, /api/bootstrap и PATCH /api/settings берут язык отсюда.
@Module({
  imports: [NearbyModule, UsersModule],
  controllers: [UiLanguageController],
  providers: [UiLanguageService],
  exports: [UiLanguageService],
})
export class UiLanguageModule {}
