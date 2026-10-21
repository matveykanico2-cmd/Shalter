import { broadcastToUsers } from "../../../legacy/legacy.js";

/** Событие всем участникам чата, кроме автора действия (его вкладка уже знает ответ). */
export function broadcastToOtherMembers(chat: { memberIds: string[] }, uid: string, event: { type: string; [key: string]: unknown }): void {
  broadcastToUsers(chat.memberIds.filter((id) => id !== uid), event);
}
