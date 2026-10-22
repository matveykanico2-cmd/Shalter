import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AdCampaignsRepository } from "./ad-campaigns.repository.js";
import { AdCampaignsService } from "./ad-campaigns.service.js";
import { AdReviewService } from "./ad-review.service.js";
import { AdsCabinetService } from "./ads-cabinet.service.js";
import { AdsController } from "./ads.controller.js";
import { ProfileImpressionsStore } from "./stores/profile-impressions.store.js";

// Реклама (/api/ads): кабинет рекламы в профиле, кампании за звёзды с показом и кликами,
// модерация объявлений. Кабинет, оплаченный донатом, выдаёт server/lib/fulfillOrder.js.
@Module({
  imports: [UsersModule],
  controllers: [AdsController],
  providers: [AdsCabinetService, AdCampaignsService, AdReviewService, AdCampaignsRepository, ProfileImpressionsStore],
})
export class AdsModule {}
