import { Module } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { UsersModule } from "../users/users.module.js";
import { SupportController } from "./support.controller.js";
import { SupportService } from "./support.service.js";

// Поддержка: чат с Hugo и с администрацией (/api/support).
@Module({
  imports: [UsersModule, MessagesModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
