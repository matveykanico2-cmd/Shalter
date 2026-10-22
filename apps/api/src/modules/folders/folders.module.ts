import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { FoldersController } from "./folders.controller.js";
import { FoldersRepository } from "./folders.repository.js";
import { FoldersService } from "./folders.service.js";

// Папки чатов (/api/folders).
@Module({
  imports: [ChatsModule],
  controllers: [FoldersController],
  providers: [FoldersService, FoldersRepository],
  exports: [FoldersRepository],
})
export class FoldersModule {}
