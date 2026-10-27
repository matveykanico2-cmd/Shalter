import { Module } from "@nestjs/common";
import { PushController } from "./push.controller.js";
import { PushSubscriptionsRepository } from "./push-subscriptions.repository.js";
import { PushService } from "./push.service.js";

// Подписки на уведомления (/api/push). Отправка — server/push.js через мост push().
@Module({
  controllers: [PushController],
  providers: [PushService, PushSubscriptionsRepository],
})
export class PushModule {}
