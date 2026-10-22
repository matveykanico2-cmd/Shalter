import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { GiftCatalogAdminService } from "./gift-catalog-admin.service.js";
import { GiftCatalogService } from "./gift-catalog.service.js";
import { GiftDeliveryService } from "./gift-delivery.service.js";
import { GiftSendersService } from "./gift-senders.service.js";
import { GiftsController } from "./gifts.controller.js";
import { GiftsRepository } from "./gifts.repository.js";
import { GiftsService } from "./gifts.service.js";

// Подарки (/api/gifts): витрина и покупка за звёзды, полка полученных подарков, свои
// нарисованные подарки и каталог в админке. Гифки подарков обрабатываются в server/ (ffmpeg),
// а подарки, оплаченные донатом, вручает server/lib/fulfillOrder.js.
@Module({
  imports: [UsersModule, MessagesModule],
  controllers: [GiftsController],
  providers: [GiftsService, GiftCatalogAdminService, GiftCatalogService, GiftDeliveryService, GiftSendersService, GiftsRepository],
  exports: [GiftSendersService],
})
export class GiftsModule {}
