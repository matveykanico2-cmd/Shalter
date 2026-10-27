// Общие кирпичики схем. Схемы строгие (z.strictObject): лишнее поле в ответе —
// такая же ошибка контракта, как пропавшее. Поля, которые сервер отдаёт только
// в части случаев (undefined → ключа нет в JSON), помечены .optional() — список
// таких полей взят из исходников (server/data/*.js rowTo*), а не угадан.
import { z } from "zod";

/** id из server/lib/genId.js: префикс, «_», время + случайный хвост. */
export const genId = (prefix?: string) =>
  z.string().regex(prefix ? new RegExp(`^${prefix}_[a-z0-9]{8,}$`) : /^[a-z]+_[a-z0-9]{8,}$/);

export const isoDate = z.iso.datetime();
export const anyJson = z.unknown();

/** Ошибка API: { error: "…" } и ничего больше. */
export const errorBody = z.strictObject({ error: z.string() });
export const okBody = z.strictObject({ ok: z.literal(true) });
