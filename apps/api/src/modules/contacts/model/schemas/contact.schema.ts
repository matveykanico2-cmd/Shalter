import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

// Как server/routes/contacts.js: id не строкой не найдётся ни в одной строке таблицы.
const contactId = () =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v : ""));

/** Своё имя контакта: строка — обрезанная до 80 символов, иначе null. */
const localName = () =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim().slice(0, 80) : null));

// «Себе» сервис проверяет сам тем же текстом — схема не знает, кто добавляет.
export const addContactSchema = requestBody({
  userId: z
    .unknown()
    .optional()
    .refine((v) => !!v, { error: "Некорректный контакт" })
    .transform((v) => (typeof v === "string" ? v : "")),
  localName: localName(),
  sharePhone: z
    .unknown()
    .optional()
    .transform((v) => v === true),
});
export type AddContactDto = z.infer<typeof addContactSchema>;

export const contactNoteSchema = requestBody({
  userId: contactId(),
  note: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim().slice(0, 1000) : "")),
});
export type ContactNoteDto = z.infer<typeof contactNoteSchema>;

export const renameContactSchema = requestBody({ userId: contactId(), localName: localName() });
export type RenameContactDto = z.infer<typeof renameContactSchema>;

export const removeContactSchema = requestBody({ userId: contactId() });
export type RemoveContactDto = z.infer<typeof removeContactSchema>;

/** Запись записной книжки: поля как пришли (не объект — без полей). */
const bookEntry = (e: unknown) => {
  const entry = e as { phone?: unknown; name?: unknown } | null | undefined;
  return { phone: entry?.phone, name: entry?.name };
};

// Не больше 1000 номеров — ответ 413, его сервис отдаёт сам.
export const matchContactsSchema = requestBody({
  contacts: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v.map(bookEntry) : [])),
});
export type MatchContactsDto = z.infer<typeof matchContactsSchema>;
