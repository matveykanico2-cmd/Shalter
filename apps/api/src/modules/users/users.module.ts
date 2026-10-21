import { Module } from "@nestjs/common";
import { UsersRepository } from "./users.repository.js";

// Пользователи. Маршруты профиля пока в server/; здесь — данные для перенесённых модулей.
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
