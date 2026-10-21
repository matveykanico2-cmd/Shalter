import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { sendMessageAndBroadcast } from "../../legacy/legacy.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import type { Chat } from "./model/domain.js";

/** Смена роли, о которой пишется строка в ленте группы. */
export type AnnouncedRole = "promote" | "demote" | "mod" | "unmod" | "owner" | "unowner" | "unban";

// Строки в ленте группы о смене ролей, как в Telegram. kick/ban/add и передача
// владения объявляются в своих ветках отдельно.
const ROLE_NOTES: Record<AnnouncedRole, (actor: string, target: string, self: boolean) => string> = {
  promote: (a, t) => `${a} назначил(а) ${t} администратором`,
  demote: (a, t, self) => (self ? `${a} больше не администратор` : `${a} снял(а) ${t} с должности администратора`),
  mod: (a, t) => `${a} назначил(а) ${t} модератором`,
  unmod: (a, t) => `${a} снял(а) ${t} с должности модератора`,
  owner: (a, t) => `${a} сделал(а) ${t} совладельцем группы`,
  unowner: (a, t) => `${a} снял(а) с ${t} права владельца`,
  unban: (a, t) => `${a} разблокировал(а) ${t}`,
};

// Служебные строки в ленте чата от бота «Shalter»: «Иван изменил(а) название группы».
// Сами сообщения пока пишет server/lib/systemChat.js.
@Injectable()
export class ChatNotesService {
  public constructor(private readonly users: UsersRepository) {}

  /** Строка о действии actorId; build(имя, автор) → текст или null, если объявлять нечего. */
  public async note(chat: Chat, actorId: string | null, build: (name: string, actor: User | undefined) => string | null): Promise<unknown> {
    const actor = actorId ? this.users.findById(actorId) : undefined;
    const text = build(actor?.name ?? "Кто-то", actor);
    if (!text) return null;
    // Строка о собственном действии у автора не должна висеть непрочитанной.
    const readByIds = [...new Set([SYSTEM_BOT_ID, actorId].filter((id): id is string => !!id))];
    return sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, { type: "system", readByIds });
  }

  /** Строка без отметки о прочтении автором действия. */
  public system(chat: Chat, text: string): Promise<unknown> {
    return sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, { type: "system" });
  }

  /** Строка о смене роли — только в группах, в фоне: ошибка не роняет само действие. */
  public announceRole(chat: Chat, actorId: string, targetId: string, role: string): void {
    const build = ROLE_NOTES[role as AnnouncedRole];
    if (!build || chat.type !== "group") return;
    (async () => {
      const target = targetId ? this.users.findById(targetId) : undefined;
      await this.note(chat, actorId, (name) => build(name, target?.name ?? "участника", actorId === targetId));
    })().catch((err) => console.error("role note failed:", err));
  }
}
