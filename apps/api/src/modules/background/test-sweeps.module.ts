import { Module } from "@nestjs/common";
import { BackgroundModule } from "./background.module.js";
import { TestSweepsController } from "./test-sweeps.controller.js";
import { TestSweepsService } from "./test-sweeps.service.js";

// POST /api/test/sweeps/:name — подключается только в режиме контрактных тестов (app.module.ts).
@Module({
  imports: [BackgroundModule],
  controllers: [TestSweepsController],
  providers: [TestSweepsService],
})
export class TestSweepsModule {}
