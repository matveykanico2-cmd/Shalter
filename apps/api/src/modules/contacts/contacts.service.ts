import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { exceptionsFor, normalizePrivacy } from "../users/lib/privacy-rules.js";
import { contactNote, sealContactNote } from "../users/lib/contact-note.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { indexUsersByPhone, phoneKey } from "./lib/phone-match.js";
import type { AddContactDto, ContactNoteDto, MatchContactsDto, RemoveContactDto, RenameContactDto } from "./model/schemas/contact.schema.js";

const MAX_PHONES_PER_REQUEST = 1000;

const localNameOf = (raw: unknown): string | null => (typeof raw === "string" ? raw.trim().slice(0, 80) : null);
// Id не строкой не найдётся ни в одной строке таблицы.
const idOf = (raw: unknown): string => (typeof raw === "string" ? raw : "");

// Контакты (/api/contacts) — как server/routes/contacts.js.
@Injectable()
export class ContactsService {
  public constructor(
    private readonly contacts: ContactsRepository,
    private readonly users: UsersRepository,
    private readonly userSettings: UserSettingsService,
    private readonly privacy: UserPrivacyService
  ) {}

  public async list(uid: string) {
    // Себя в списке контактов не показываем: подарок себе, звонок себе и «отправить
    // контакт» себе невозможны, а импорт контактов может добавить собственный номер.
    const contacts = this.contacts.findForOwner(uid).filter((c) => c.userId !== uid);
    const byId = new Map(this.users.findByIds(contacts.map((c) => c.userId)).map((u) => [u.id, u]));
    const resolved = await Promise.all(
      contacts.map(async (c) => {
        const user = byId.get(c.userId);
        if (!user) return null;
        const visible = this.privacy.publicUserFor(user, uid);
        // Заблокировавший вас номер не показывает — как и в профиле.
        const blockedMe = (user.blockedUserIds ?? []).includes(uid);
        if (!blockedMe && this.privacy.allowsUser(user.id, "phone", uid)) visible.phone = user.phone;
        return { ...c, localName: c.localName ?? null, note: contactNote(c), user: visible };
      })
    );
    return { contacts: resolved.filter((c) => c !== null) };
  }

  public ids(uid: string) {
    return { ids: this.contacts.findForOwner(uid).map((c) => c.userId) };
  }

  public add(uid: string, { userId, localName, sharePhone }: AddContactDto) {
    if (!userId || userId === uid) throw new ApiError(400, "Некорректный контакт");
    const target = this.users.findById(idOf(userId));
    if (!target) throw new ApiError(404, "Пользователь не найден");
    const contact = this.contacts.add({
      id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: uid,
      userId: target.id,
      addedAt: new Date().toISOString(),
      localName: localNameOf(localName),
    });
    // «Поделиться моим номером», как в Telegram: этот человек увидит ваш номер,
    // даже если в приватности он скрыт (исключение «Всегда показывать»).
    if (sharePhone === true) this.sharePhoneWith(uid, target.id);
    // Уже существующий контакт приходит строкой из базы — заметку расшифровываем, как в /rename.
    return { contact: "note" in contact ? { ...contact, note: contactNote(contact) } : contact };
  }

  public setNote(uid: string, dto: ContactNoteDto) {
    const userId = idOf(dto.userId);
    const note = typeof dto.note === "string" ? dto.note.trim().slice(0, 1000) : "";
    if (!this.contacts.setNote(uid, userId, sealContactNote(uid, userId, note || null))) {
      throw new ApiError(404, "Сначала добавьте человека в контакты");
    }
    return { note: note || null };
  }

  public rename(uid: string, { userId, localName }: RenameContactDto) {
    const contact = this.contacts.rename(uid, idOf(userId), localNameOf(localName));
    if (!contact) throw new ApiError(404, "Контакт не найден");
    return { contact: { ...contact, note: contactNote(contact) } };
  }

  public remove(uid: string, { userId }: RemoveContactDto) {
    this.contacts.remove(uid, idOf(userId));
    return { ok: true };
  }

  /** Кто из записной книжки есть в Shalter; скрытые приватностью, блокировкой или баном — в notFound. */
  public async match(uid: string, dto: MatchContactsDto) {
    const entries: any[] = Array.isArray(dto.contacts) ? dto.contacts : [];
    if (entries.length > MAX_PHONES_PER_REQUEST) {
      throw new ApiError(413, `За один раз можно проверить не больше ${MAX_PHONES_PER_REQUEST} номеров`);
    }

    const me = this.users.findById(uid);
    const contactIds = this.contacts.contactIdsOf(uid);
    const blockedByMe = new Set(me?.blockedUserIds ?? []);
    const index = indexUsersByPhone(this.users.findAll());

    const candidates: { user: User; name: string; phone: string }[] = [];
    const notFound: { phone: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = phoneKey(entry?.phone);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const name = typeof entry?.name === "string" ? entry.name.slice(0, 120) : "";
      const user = index.get(key);
      const phone = String(entry?.phone ?? "").slice(0, 40);
      if (user) candidates.push({ user, name, phone });
      else notFound.push({ phone, name });
    }

    const found = [];
    for (const { user, name, phone } of candidates) {
      if (user.id === uid) continue;
      const hidden =
        user.isBanned ||
        (user.blockedUserIds ?? []).includes(uid) ||
        blockedByMe.has(user.id) ||
        !this.privacy.allowsUser(user.id, "discoverByPhone", uid);
      if (hidden) notFound.push({ phone, name });
      else found.push({ user: publicUser(user), alreadyContact: contactIds.has(user.id), localName: name });
    }
    return { found, notFound, checked: seen.size };
  }

  private sharePhoneWith(uid: string, userId: string): void {
    const privacy = this.userSettings.get(uid).privacy ?? {};
    const { allow, deny } = exceptionsFor(privacy, "phone");
    const exceptions = {
      ...(privacy.exceptions ?? {}),
      phone: { allow: [...new Set([...allow, userId])], deny: deny.filter((id) => id !== userId) },
    };
    this.userSettings.update(uid, { privacy: normalizePrivacy({ ...privacy, exceptions }) });
  }
}
