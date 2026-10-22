import { Module } from "@nestjs/common";
import { SettingsRepository } from "./settings.repository.js";
import { UserSettingsService } from "./user-settings.service.js";
import { UsersRepository } from "./users.repository.js";

// Пользователи и их настройки: данные для перенесённых модулей. Маршруты профиля (/api/users) —
// модуль profiles, настроек (/api/settings) — модуль settings.
@Module({
  providers: [UsersRepository, SettingsRepository, UserSettingsService],
  exports: [UsersRepository, UserSettingsService],
})
export class UsersModule {}
