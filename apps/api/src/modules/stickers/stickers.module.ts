import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { CustomEmojiRepository } from "./custom-emoji.repository.js";
import { CustomEmojiService } from "./custom-emoji.service.js";
import { StickerPacksRepository } from "./sticker-packs.repository.js";
import { StickerPacksService } from "./sticker-packs.service.js";
import { CustomEmojiController, StickerPacksController } from "./stickers.controller.js";

// Свои стикерпаки (/api/stickers) и каталог своих эмодзи (/api/custom-emoji).
@Module({
  imports: [UsersModule],
  controllers: [StickerPacksController, CustomEmojiController],
  providers: [StickerPacksService, StickerPacksRepository, CustomEmojiService, CustomEmojiRepository],
})
export class StickersModule {}
