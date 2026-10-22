import { Module } from "@nestjs/common";
import { ContactsRepository } from "./contacts.repository.js";
import { SettingsRepository } from "./settings.repository.js";
import { UserSettingsService } from "./user-settings.service.js";
import { UsersRepository } from "./users.repository.js";

// Пользователи, их контакты и настройки: данные для перенесённых модулей. Маршруты профиля (/api/users) —
// модуль profiles, контактов (/api/contacts) — contacts, настроек (/api/settings) — settings.
@Module({
  providers: [UsersRepository, ContactsRepository, SettingsRepository, UserSettingsService],
  exports: [UsersRepository, ContactsRepository, UserSettingsService],
})
export class UsersModule {}
