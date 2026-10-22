import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE } from "../../common/config/accounts.js";
import { ensureHugoAccount, findOrCreateDm, HUGO_ID, sendMessageAndBroadcast, type LegacyChat } from "../../legacy/legacy.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { UsersRepository } from "../users/users.repository.js";

// Поддержка (/api/support) — как server/routes/support.js: чат с Hugo и сообщение об ошибке
// администрации. В пустой чат — приветствие (один раз).
const HUGO_WELCOME =
  "Здравствуйте! Я Hugo — поддержка Shalter.\n\n" +
  "Спросите про звёзды, Premium, подарки, двухфакторную аутентификацию, ботов или где скачать приложение — отвечу сразу.\n\n" +
  "Если проблема сложнее, опишите её: что вы делали, что ожидали и что получилось. Такое сообщение прочитает человек.\n\n" +
  "И ещё я проверяю тексты — напишите «проверь» и следом фразу.";
const ADMIN_WELCOME =
  "Здравствуйте! Это чат с администрацией Shalter.\n\n" +
  "Опишите ошибку: что вы делали, что ожидали и что получилось — по возможности приложите скриншот. Мы разберёмся.";

@Injectable()
export class SupportService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly messages: MessagesRepository
  ) {}

  public async hugoChat(uid: string) {
    const chat = await this.openHugoChat(uid);
    return { chatId: chat.id };
  }

  /** Чат с главным админом; нет админа или это он сам — чат с Hugo. */
  public async report(uid: string) {
    const admin = ADMIN_PHONE ? this.users.findByPhone(ADMIN_PHONE) : null;
    if (!admin || admin.id === uid) return { chatId: (await this.openHugoChat(uid)).id };
    const chat = await findOrCreateDm(uid, admin.id);
    await this.greetOnce(chat, uid, admin.id, ADMIN_WELCOME);
    return { chatId: chat.id };
  }

  private async openHugoChat(uid: string): Promise<LegacyChat> {
    ensureHugoAccount();
    const chat = await findOrCreateDm(uid, HUGO_ID);
    await this.greetOnce(chat, uid, HUGO_ID, HUGO_WELCOME);
    return chat;
  }

  private async greetOnce(chat: LegacyChat, uid: string, senderId: string, text: string): Promise<void> {
    if (this.messages.listFeed(chat.id, uid).length === 0) await sendMessageAndBroadcast(chat, senderId, text);
  }
}
