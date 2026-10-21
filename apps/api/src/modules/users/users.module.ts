import { Module } from "@nestjs/common";
import { UsersRepository } from "./users.repository.js";

// Пользователи: данные для перенесённых модулей. Маршруты профиля (/api/users) — модуль profiles.
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
