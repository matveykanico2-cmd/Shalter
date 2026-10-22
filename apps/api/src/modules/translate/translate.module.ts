import { Module } from "@nestjs/common";
import { TranslateController } from "./translate.controller.js";
import { TranslateService } from "./translate.service.js";
import { TranslationCacheRepository } from "./translation-cache.repository.js";

// Перевод сообщений и строк интерфейса (/api/translate).
@Module({
  controllers: [TranslateController],
  providers: [TranslateService, TranslationCacheRepository],
})
export class TranslateModule {}
