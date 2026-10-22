import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — как server/routes/contacts.js; схема только оставляет известные поля.
export const addContactSchema = requestBody({ userId: raw(), localName: raw(), sharePhone: raw() });
export type AddContactDto = z.infer<typeof addContactSchema>;

export const contactNoteSchema = requestBody({ userId: raw(), note: raw() });
export type ContactNoteDto = z.infer<typeof contactNoteSchema>;

export const renameContactSchema = requestBody({ userId: raw(), localName: raw() });
export type RenameContactDto = z.infer<typeof renameContactSchema>;

export const removeContactSchema = requestBody({ userId: raw() });
export type RemoveContactDto = z.infer<typeof removeContactSchema>;

export const matchContactsSchema = requestBody({ contacts: raw() });
export type MatchContactsDto = z.infer<typeof matchContactsSchema>;
