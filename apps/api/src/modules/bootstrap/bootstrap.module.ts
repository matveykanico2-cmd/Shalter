import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { FoldersModule } from "../folders/folders.module.js";
import { UsersModule } from "../users/users.module.js";
import { BootstrapController } from "./bootstrap.controller.js";
import { BootstrapService } from "./bootstrap.service.js";

// Первый экран клиента (/api/bootstrap): настройки, чаты, папки и контакты.
@Module({
  imports: [ChatsModule, FoldersModule, UsersModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
