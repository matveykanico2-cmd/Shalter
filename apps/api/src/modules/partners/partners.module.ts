import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { PartnersController } from "./partners.controller.js";
import { PartnersService } from "./partners.service.js";

// Партнёрская программа (/api/partners).
@Module({
  imports: [UsersModule, MessagesModule],
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
