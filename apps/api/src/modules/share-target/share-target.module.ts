import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ShareTargetBodyMiddleware } from "./share-target.middleware.js";
import { ShareTargetController } from "./share-target.controller.js";
import { ShareTargetService } from "./share-target.service.js";
import { ShareBoxStore } from "./stores/share-box.store.js";

// Системное «Поделиться» (/share-target и /api/share/:token): оба маршрута делят ящик в памяти,
// поэтому переносятся вместе.
@Module({
  controllers: [ShareTargetController],
  providers: [ShareTargetService, ShareBoxStore, ShareTargetBodyMiddleware],
})
export class ShareTargetModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ShareTargetBodyMiddleware).forRoutes({ path: "share-target", method: RequestMethod.POST });
  }
}
