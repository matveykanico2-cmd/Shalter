import { Injectable, PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiError } from "../errors/api-error.js";

// Проверка тела или параметра по Zod-схеме: `@Body(new ZodValidationPipe(schema)) dto`.
// Ответ на неверные данные — 400 с текстом первой ошибки схемы, поэтому тексты
// старого API задаются в самой схеме: z.string({ error: "Введите имя" }).
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  public constructor(private readonly schema: TSchema) {}

  public transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new ApiError(400, result.error.issues[0]?.message ?? "bad request");
    return result.data;
  }
}
