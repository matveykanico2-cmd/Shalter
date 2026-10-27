import { textCrypto } from "../../../legacy/legacy.js";
import type { ContactRow } from "../model/domain.js";

// Личная заметка о контакте (видит только владелец) зашифрована, как и переписка, —
// тем же server/lib/textCrypto.js и с той же привязкой, что server/data/contacts.js.
const noteAad = (ownerId: string, userId: string) => `cnote:${ownerId}:${userId}`;

/** Расшифрованная заметка к контакту или null. */
export function contactNote(row: Pick<ContactRow, "ownerId" | "userId" | "note"> | null | undefined): string | null {
  return row?.note ? textCrypto().decryptText(noteAad(row.ownerId, row.userId), row.note) : null;
}

/** Заметка для записи в базу; пустая — null. */
export function sealContactNote(ownerId: string, userId: string, note: string | null): string | null {
  return note ? textCrypto().encryptText(noteAad(ownerId, userId), note) : null;
}
