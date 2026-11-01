import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { GeoService } from "./geo.service.js";
import { GeoController, NearbyController } from "./nearby.controller.js";
import { NearbyRepository } from "./nearby.repository.js";
import { NearbyService } from "./nearby.service.js";

// «Люди рядом» (/api/nearby) и запасная геолокация по IP и поиск адреса (/api/geo).
@Module({
  imports: [UsersModule],
  controllers: [NearbyController, GeoController],
  providers: [NearbyService, NearbyRepository, GeoService],
  // Страна по IP нужна и языку интерфейса (модуль ui-language).
  exports: [GeoService],
})
export class NearbyModule {}
