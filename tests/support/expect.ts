// Проверки с понятными сообщениями: при падении видно тело ответа и путь до
// поля, которое не совпало со схемой.
import { expect } from "vitest";
import { z } from "zod";
import type { ApiResponse } from "./client";

export function expectShape<S extends z.ZodType>(schema: S, value: unknown, what = "ответ"): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${what} не совпал со схемой:\n${z.prettifyError(parsed.error)}\n\nзначение: ${JSON.stringify(value, null, 2).slice(0, 3000)}`);
  }
  return parsed.data;
}

export function expectStatus(res: ApiResponse, status: number): void {
  expect(res.status, `ожидали ${status}, тело: ${res.text.slice(0, 1000)}`).toBe(status);
}

/** Статус + схема тела одной строкой. */
export function expectOk<S extends z.ZodType>(res: ApiResponse, schema: S, status = 200): z.infer<S> {
  expectStatus(res, status);
  return expectShape(schema, res.body, `тело ответа ${status}`);
}

/** Ошибка API: статус и точный текст ошибки (тексты видит пользователь — это тоже контракт). */
export function expectError(res: ApiResponse, status: number, error?: string | RegExp): void {
  expectStatus(res, status);
  expect(res.body, `тело ошибки: ${res.text}`).toEqual(expect.objectContaining({ error: expect.any(String) }));
  if (typeof error === "string") expect(res.body.error).toBe(error);
  else if (error) expect(res.body.error).toMatch(error);
}
