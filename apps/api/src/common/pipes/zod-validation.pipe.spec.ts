import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

const messageOf = (schema: z.ZodType, value: unknown) => {
  try {
    new ZodValidationPipe(schema).transform(value);
    return null;
  } catch (err) {
    return ((err as { getResponse: () => { error: string } }).getResponse()).error;
  }
};

describe("ZodValidationPipe", () => {
  it("свой текст схемы — как есть", () => {
    expect(messageOf(z.object({ name: z.string({ error: "Введите имя" }) }), {})).toBe("Введите имя");
  });

  it("без своего текста — по-русски, не технический текст Zod", () => {
    expect(messageOf(z.object({ emoji: z.string() }), {})).toBe("Не заполнено поле «emoji»");
    expect(messageOf(z.object({ emoji: z.string() }), { emoji: 5 })).toBe("Неверный тип поля «emoji»");
    expect(messageOf(z.object({ emoji: z.string().max(8) }), { emoji: "x".repeat(9) })).toBe("Поле «emoji» длиннее 8 символов");
    expect(messageOf(z.strictObject({}), { extra: 1 })).toBe("Лишние поля в запросе");
  });
});
