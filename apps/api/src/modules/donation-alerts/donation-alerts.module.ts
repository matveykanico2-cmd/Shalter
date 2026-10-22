import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { DonationAlertsController } from "./donation-alerts.controller.js";
import { DonationAlertsService } from "./donation-alerts.service.js";

// Подключение DonationAlerts (/api/donation-alerts). Опрос донатов и оплата заказов — в server/.
@Module({
  imports: [UsersModule],
  controllers: [DonationAlertsController],
  providers: [DonationAlertsService],
})
export class DonationAlertsModule {}
