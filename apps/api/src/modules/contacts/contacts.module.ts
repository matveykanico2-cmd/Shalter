import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { ContactsController } from "./contacts.controller.js";
import { ContactsService } from "./contacts.service.js";

// Контакты (/api/contacts): маршруты. Сами контакты — ContactsRepository из модуля users:
// им пользуются и профили, звонки и WS.
@Module({
  imports: [UsersModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
