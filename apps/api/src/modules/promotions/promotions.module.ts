import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { PromotionsController } from "./promotions.controller.js";
import { PromotionsRepository } from "./promotions.repository.js";
import { PromotionsService } from "./promotions.service.js";

// Промокоды (/api/promotions).
@Module({
  imports: [UsersModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionsRepository],
})
export class PromotionsModule {}
