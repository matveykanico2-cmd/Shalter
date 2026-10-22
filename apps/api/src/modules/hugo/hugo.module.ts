import { Module } from "@nestjs/common";
import { HugoController } from "./hugo.controller.js";
import { HugoService } from "./hugo.service.js";

// Проверка текста Хьюго (/api/hugo).
@Module({
  controllers: [HugoController],
  providers: [HugoService],
})
export class HugoModule {}
