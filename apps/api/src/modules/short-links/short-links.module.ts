import { Module } from "@nestjs/common";
import { ShortLinksController } from "./short-links.controller.js";
import { ShortLinksRepository } from "./short-links.repository.js";
import { ShortLinksService } from "./short-links.service.js";

// Короткие ссылки: переход (/s/:code) и счётчик (/api/short-links).
@Module({
  controllers: [ShortLinksController],
  providers: [ShortLinksService, ShortLinksRepository],
})
export class ShortLinksModule {}
