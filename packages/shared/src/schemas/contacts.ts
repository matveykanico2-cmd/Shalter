// Контакты: строки таблицы contacts (server/data/contacts.js) и ответы
// server/routes/contacts.js.
import { z } from "zod";
import { anyJson, isoDate } from "./common";
import { publicUser } from "./user";

// id из маршрута: ct_<ms>_<до 5 символов base36>, не genId.
export const contactId = z.string().regex(/^ct_\d+_[a-z0-9]{1,5}$/);

const contactBase = {
  id: contactId,
  ownerId: z.string(),
  userId: z.string(),
  addedAt: isoDate,
  localName: z.string().nullable(),
};

/** Контакт с расшифрованной заметкой: GET /api/contacts (без user) и POST /rename. */
export const contact = z.strictObject({ ...contactBase, note: z.string().nullable() });

/**
 * POST /api/contacts: новый контакт — объект из маршрута, ключа note нет;
 * повторное добавление — строка из базы с расшифрованной заметкой.
 */
export const addedContact = z.strictObject({ ...contactBase, note: z.string().nullable().optional() });

/**
 * Профиль с учётом приватности того, кого смотрят (publicUserFor): поля, скрытые
 * настройками, удаляются целиком, плюс пометки о контакте (applyContactName).
 */
export const contactUser = publicUser.extend({
  avatarImages: z.array(anyJson).optional(),
  bio: z.string().nullable().optional(),
  inContacts: z.literal(true).optional(),
  mutualContact: z.literal(true).optional(),
  profileName: z.string().optional(),
});

export const contactListItem = z.strictObject({ ...contactBase, note: z.string().nullable(), user: contactUser });

export const matchResult = z.strictObject({
  found: z.array(z.strictObject({ user: publicUser, alreadyContact: z.boolean(), localName: z.string() })),
  notFound: z.array(z.strictObject({ phone: z.string(), name: z.string() })),
  checked: z.number().int().nonnegative(),
});
