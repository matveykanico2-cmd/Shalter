import { Injectable, PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiError } from "../errors/api-error.js";

// Проверка тела или параметра по Zod-схеме: `@Body(new ZodValidationPipe(schema)) dto`.
// Ответ на неверные данные — 400 с текстом первой ошибки схемы, поэтому тексты
// старого API задаются в самой схеме: z.string({ error: "Введите имя" }). Где схема своего
// текста не задала, человек видит не «Invalid input: expected string, received undefined»,
// а русскую фразу (zodIssueText): свой текст схемы всегда важнее.
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  public constructor(private readonly schema: TSchema) {}

  public transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value, { error: zodIssueText });
    if (!result.success) throw new ApiError(400, result.error.issues[0]?.message ?? "Некорректный запрос");
    return result.data;
  }
}

type Issue = { code?: string; input?: unknown; path?: PropertyKey[]; origin?: string; maximum?: unknown; minimum?: unknown };

/** Текст ошибки, которую схема не подписала сама: по-русски и с именем поля. */
export function zodIssueText(issue: Issue): string {
  const field = issue.path?.length ? ` «${issue.path.map(String).join(".")}»` : "";
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? `Не заполнено поле${field}` : `Неверный тип поля${field}`;
    case "too_big":
      return issue.origin === "string" ? `Поле${field} длиннее ${String(issue.maximum)} символов` : `Слишком большое значение поля${field}`;
    case "too_small":
      return issue.origin === "string" && issue.minimum === 1 ? `Не заполнено поле${field}` : `Слишком маленькое значение поля${field}`;
    case "unrecognized_keys":
      return "Лишние поля в запросе";
    default:
      return `Некорректное значение поля${field}`;
  }
}
