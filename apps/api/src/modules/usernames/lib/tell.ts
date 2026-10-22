import { SYSTEM_BOT_ID } from "../../../common/config/accounts.js";
import { findOrCreateDm, sendMessageAndBroadcast } from "../../../legacy/legacy.js";

/** Сообщение от служебного бота Shalter; ошибка доставки не валит маршрут. */
export async function tell(userId: string, text: string, what = "username auction notice"): Promise<void> {
  try {
    const chat = await findOrCreateDm(SYSTEM_BOT_ID, userId);
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
  } catch (err) {
    console.error(`${what} failed:`, err);
  }
}
