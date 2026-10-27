import { Module } from "@nestjs/common";
import { SessionsController } from "./sessions.controller.js";
import { SessionsRepository } from "./sessions.repository.js";
import { SessionsService } from "./sessions.service.js";

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, SessionsRepository],
  exports: [SessionsRepository],
})
export class SessionsModule {}
