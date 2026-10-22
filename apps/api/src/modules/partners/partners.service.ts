import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { findOrCreateDm, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { UsersRepository } from "../users/users.repository.js";

// Партнёрская программа (/api/partners) — как server/routes/partners.js: условия и чат с администрацией.
const PARTNER_TARIFF_TEXT =
  "Условия партнёрской программы обсуждаются индивидуально — напишите администрации через кнопку ниже, расскажите про свою аудиторию, и вам предложат тариф.";

@Injectable()
export class PartnersService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly messages: MessagesRepository
  ) {}

  public me() {
    return { tariffText: PARTNER_TARIFF_TEXT };
  }

  /** Личный чат с главным админом; в пустой чат — первое сообщение от пользователя. */
  public async chat(uid: string) {
    const admin = this.users.findByPhone(ADMIN_PHONE);
    if (!admin) throw new ApiError(503, "Администрация Shalter ещё не зарегистрирована в приложении");
    if (admin.id === uid) throw new ApiError(400, "Вы и есть администрация");

    const chat = await findOrCreateDm(uid, admin.id);
    if (this.messages.listFeed(chat.id, uid).length === 0) {
      await sendMessageAndBroadcast(chat, uid, "Здравствуйте! Хочу узнать про партнёрскую программу.");
    }
    return { chatId: chat.id };
  }
}
