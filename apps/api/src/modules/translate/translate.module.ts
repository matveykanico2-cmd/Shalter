import { Module } from "@nestjs/common";
import { GuestTranslateController, TranslateController } from "./translate.controller.js";
import { GuestTranslationBudgetStore } from "./stores/guest-translation-budget.store.js";
import { TranslateService } from "./translate.service.js";
import { TranslationCacheRepository } from "./translation-cache.repository.js";

// Перевод сообщений и строк интерфейса (/api/translate); /api/translate/ui — строки интерфейса без входа.
@Module({
  controllers: [GuestTranslateController, TranslateController],
  providers: [TranslateService, TranslationCacheRepository, GuestTranslationBudgetStore],
})
export class TranslateModule {}
