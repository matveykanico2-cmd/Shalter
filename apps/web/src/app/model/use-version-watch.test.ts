import { describe, expect, it } from "vitest";

import { nativeUpdateState, newer } from "./use-version-watch";

describe("обновление нативной оболочки", () => {
  it("сравнивает числовые части версии", () => {
    expect(newer("1.10.0", "1.9.9")).toBe(true);
    expect(newer("1.2", "1.2.0")).toBe(false);
  });

  it("старая оболочка без номера считается версией 0 и получает обязательное обновление", () => {
    expect(nativeUpdateState({ version: "2.4.0", minimumVersion: "2.0.0" }, "0")).toEqual({ available: true, mandatory: true });
  });

  it("обычная новая версия не становится обязательной выше минимума", () => {
    expect(nativeUpdateState({ version: "2.4.0", minimumVersion: "2.0.0" }, "2.1.0")).toEqual({ available: true, mandatory: false });
  });

  it("нет версии с сервера — обновление не предлагается (в том числе при прокси/офлайн fallback)", () => {
    expect(nativeUpdateState({ version: null, minimumVersion: "2.0.0" }, "1.0.0")).toEqual({ available: false, mandatory: false });
  });
});
