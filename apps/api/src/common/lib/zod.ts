import { z } from "zod";

// Помощники для схем запросов, перенесённых из server/: старые маршруты читают поля как
// `String(req.body?.x ?? "")`. Схема приводит поля так же, а проверку с текстом ошибки берёт
// на себя, только если в старом маршруте она шла первой (до поиска в базе и проверки прав) —
// иначе проверка остаётся в сервисе, чтобы побеждала та же ошибка. Основа поля —
// z.unknown().optional(): без .optional() Zod 4 отвергает отсутствующий ключ.

/** Тело запроса: не объект (нет тела, массив) — как пустой объект, как `req.body ?? {}`. */
export const requestBody = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess((body) => (body && typeof body === "object" && !Array.isArray(body) ? body : {}), z.object(shape));

/** Поле-строка; нет поля или null — пустая строка. */
export const text = () => z.unknown().optional().transform((v) => (v == null ? "" : String(v)));

/** Поле-строка; нет поля или null — undefined (для `x ?? запасное`). */
export const optionalText = () => z.unknown().optional().transform((v) => (v == null ? undefined : String(v)));

/** Строка запроса (?a=…) — те же правила, что у тела. */
export const requestQuery = requestBody;

/** Поле как пришло, любого типа; нет поля — нет и ключа (для `"x" in body` и `typeof body.x`). */
export const raw = () => z.unknown().optional();
