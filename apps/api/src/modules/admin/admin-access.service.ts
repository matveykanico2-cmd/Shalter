import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection, outranks } from "../../common/lib/admin-access.js";
import { findOrCreateDm, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";

const RANK_ERROR = "Нельзя применять это к администратору вашего уровня или выше";

// Общее для разделов админки (server/routes/admin.js): право на раздел, старшинство админов,
// поиск цели и уведомления от бота Shalter.
@Injectable()
export class AdminAccessService {
  public constructor(private readonly users: UsersRepository) {}

  /** Админ с этим разделом (moderation, legal, server, pricing…); иначе 403. */
  public require(uid: string, section: string): User {
    const me = this.users.findById(uid);
    if (!me || !hasAdminSection(me, section)) throw new ApiError(403, "Недостаточно прав");
    return me;
  }

  /** Действие модерации к равному или старшему админу — 403. */
  public assertOutranks(admin: User, target: User): void {
    if (!outranks(admin, target)) throw new ApiError(403, RANK_ERROR);
  }

  public target(id: unknown): User {
    const user = typeof id === "string" ? this.users.findById(id) : undefined;
    if (!user) throw new ApiError(404, "Пользователь не найден");
    return user;
  }

  /** Подтверждение опасного действия: @ник или id цели. */
  public assertConfirmed(target: User, confirm: unknown): void {
    const typed = String(confirm ?? "").trim().replace(/^@/, "").toLowerCase();
    if (typed !== (target.username || target.id).toLowerCase()) {
      throw new ApiError(400, `Для подтверждения введите @${target.username || target.id}`);
    }
  }

  /** Сообщение пользователю от бота Shalter; ошибка — только в лог под label. */
  public async notify(userId: string, text: string, label: string): Promise<void> {
    try {
      const chat = await findOrCreateDm(SYSTEM_BOT_ID, userId);
      await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
    } catch (err) {
      console.error(`${label} failed:`, err);
    }
  }
}
