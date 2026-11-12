import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";
import { TimingsStore } from "./stores/timings.store.js";

// Замеры скорости клиента: запуск приложения и открытие чата, сводка в лог.
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, TimingsStore],
})
export class MetricsModule {}
