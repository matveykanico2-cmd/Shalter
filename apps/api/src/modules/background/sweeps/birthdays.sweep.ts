import fs from "node:fs";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { SYSTEM_BOT_ID } from "../../../common/config/accounts.js";
import { REPO_ROOT } from "../../../common/config/paths.js";
import { findOrCreateDm, sendMessageAndBroadcast, sendMessagePush } from "../../../legacy/legacy.js";
import { ContactsRepository } from "../../users/contacts.repository.js";
import { UsersRepository } from "../../users/users.repository.js";
import { GreetingsRepository } from "../greetings.repository.js";
import type { Sweep } from "../model/sweep.js";

// Подсказки подарков — server/data/catalog/birthday-suggestions.json, первыми идут
// подобранные вручную. В сообщение кладём только начало списка: карточка показывает
// 4 штуки, а весь список весил ~640 КБ в каждом поздравлении.
const SUGGESTIONS_IN_MESSAGE = 8;
const SUGGESTIONS_FILE = path.join(REPO_ROOT, "server", "data", "catalog", "birthday-suggestions.json");
let suggestions: unknown[] | null = null;
const giftSuggestions = () => (suggestions ??= (JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, "utf8")) as unknown[]).slice(0, SUGGESTIONS_IN_MESSAGE));

// Дни рождения — server/lib/birthdaySweep.js: раз в час и сразу при запуске. Владельцы
// контакта получают от Shalter поздравление с подсказками подарков и пуш, раз в год.
@Injectable()
export class BirthdaysSweep implements Sweep {
  public readonly name = "birthdays";
  public readonly intervalMs = 60 * 60 * 1000;
  public readonly runAtStart = true;
  public readonly failMessage = "birthday sweep failed:";

  public constructor(
    private readonly users: UsersRepository,
    private readonly contacts: ContactsRepository,
    private readonly greetings: GreetingsRepository
  ) {}

  public async once(now: Date): Promise<void> {
    const birthdayUsers = this.users.listWithBirthdayOn(now.toISOString());
    if (!birthdayUsers.length) return;
    const year = now.getFullYear();

    for (const person of birthdayUsers) {
      const ownerIds = this.contacts.listOwnersOf(person.id).filter((id) => id !== person.id);
      for (const ownerId of ownerIds) {
        if (this.greetings.birthdaySent(ownerId, person.id, year)) continue;
        try {
          const chat = await findOrCreateDm(SYSTEM_BOT_ID, ownerId);
          await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `🎂 Сегодня день рождения у ${person.name}! Поздравьте и, если хотите — подарите подарок.`, {
            attachments: [
              {
                kind: "birthday",
                meta: { userId: person.id, name: person.name, avatarImage: person.avatarImage || null, suggestedGifts: giftSuggestions() },
              },
            ],
          });
          sendMessagePush(ownerId, {
            title: "Сегодня день рождения 🎂",
            body: `У ${person.name} день рождения — загляните в чат`,
            url: `/chat/${chat.id}`,
            tag: `birthday-${person.id}-${year}`,
          }).catch(() => {});
        } catch (err) {
          console.error(`birthday greeting failed (owner ${ownerId}, birthday person ${person.id}):`, err);
        } finally {
          this.greetings.markBirthdaySent(ownerId, person.id, year);
        }
      }
    }
  }
}
