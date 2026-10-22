import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { BusinessService } from "./business.service.js";
import { PaidPlansService } from "./paid-plans.service.js";
import { BusinessController, PremiumController } from "./premium.controller.js";
import { PremiumService } from "./premium.service.js";

// Shalter Premium (/api/premium) и «Shalter для бизнеса» (/api/business).
@Module({
  imports: [UsersModule],
  controllers: [PremiumController, BusinessController],
  providers: [PremiumService, BusinessService, PaidPlansService],
})
export class PremiumModule {}
