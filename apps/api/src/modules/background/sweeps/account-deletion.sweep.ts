import { Injectable } from "@nestjs/common";
import { deleteAccount } from "../../../legacy/legacy.js";
import { UsersRepository } from "../../users/users.repository.js";
import type { Sweep } from "../model/sweep.js";

// Удаление аккаунтов, срок которых наступил, — server/lib/accountDeletionSweep.js: раз в час.
// Само удаление (чаты, боты, сеансы, контакты) — server/lib/deleteAccount.js.
@Injectable()
export class AccountDeletionSweep implements Sweep {
  public readonly name = "account-deletion";
  public readonly intervalMs = 60 * 60 * 1000;
  public readonly failMessage = "account deletion sweep failed:";

  public constructor(private readonly users: UsersRepository) {}

  public async once(now: Date): Promise<void> {
    for (const userId of this.users.listDueForDeletion(now.toISOString())) {
      try {
        await deleteAccount(userId);
      } catch (err) {
        console.error(`scheduled deletion of ${userId} failed:`, err);
      }
    }
  }
}
