import { Module } from "@nestjs/common";
import { ContactsRepository } from "./contacts.repository.js";
import { SettingsRepository } from "./settings.repository.js";
import { StarsRepository } from "./stars.repository.js";
import { UserPrivacyService } from "./user-privacy.service.js";
import { UserSettingsService } from "./user-settings.service.js";
import { UsersRepository } from "./users.repository.js";

// Пользователи, их контакты, звёзды, настройки и приватность: данные для перенесённых модулей. Маршруты профиля (/api/users) —
// модуль profiles, контактов (/api/contacts) — contacts, звёзд (/api/stars) — stars, настроек (/api/settings) — settings.
@Module({
  providers: [UsersRepository, ContactsRepository, StarsRepository, SettingsRepository, UserSettingsService, UserPrivacyService],
  exports: [UsersRepository, ContactsRepository, StarsRepository, UserSettingsService, UserPrivacyService],
})
export class UsersModule {}
