import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { testSweepSchema, type TestSweepDto } from "./model/schemas/test-sweep.schema.js";
import { TestSweepsService } from "./test-sweeps.service.js";

// Только в режиме контрактных тестов (TestSweepsModule): один проход обхода по таймеру сейчас.
@Controller("api/test/sweeps")
export class TestSweepsController {
  public constructor(private readonly service: TestSweepsService) {}

  @Post(":name")
  @HttpCode(200)
  public run(@Param("name") name: string, @Body(new ZodValidationPipe(testSweepSchema)) dto: TestSweepDto) {
    return this.service.run(name, dto.now);
  }
}
