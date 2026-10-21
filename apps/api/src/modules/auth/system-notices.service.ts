import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { findOrCreateDm, sendMessageAndBroadcast, type LegacyChat } from "../../legacy/legacy.js";

// Сообщения от бота «Shalter» в личный чат с пользователем: коды и оповещения о
// безопасности. Чат и сообщения пока живут в server/ (server/lib/systemChat.js).
@Injectable()
export class SystemNoticesService {
  // Ошибка доходит до вызывающего: без доставленного кода действие не имеет смысла.
  // botFirst — порядок участников нового чата, как у вызова в server/routes/auth.js.
  public async send(userId: string, text: string, { botFirst = false } = {}): Promise<LegacyChat> {
    const chat = botFirst ? await findOrCreateDm(SYSTEM_BOT_ID, userId) : await findOrCreateDm(userId, SYSTEM_BOT_ID);
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
    return chat;
  }

  // Оповещение: не доставилось — действие всё равно выполнено, ошибка только в лог.
  public async notify(userId: string, text: string, what: string, opts: { botFirst?: boolean } = {}): Promise<void> {
    try {
      await this.send(userId, text, opts);
    } catch (err) {
      console.error(`${what} failed:`, err);
    }
  }
}
