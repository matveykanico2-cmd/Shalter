import { describe, expect, it } from "vitest";

import { MAX_TEXT, outgoingText, overLimit, overLimitText } from "./long-text";

describe("длина сообщения", () => {
  it("лимит 20 000: ровно — можно, на символ больше — сократить на 1", () => {
    expect(overLimit("я".repeat(MAX_TEXT))).toBe(0);
    expect(overLimit("я".repeat(MAX_TEXT + 1))).toBe(1);
    expect(overLimitText(1)).toBe("Сообщение длиннее 20\u00a0000 символов — сократите на 1");
  });

  it("отправляемый текст: отступ первой строки, переносы и пробелы внутри сохраняются", () => {
    expect(outgoingText("\n\n    const a = 1;\n\n      return a;  \n\n")).toBe("    const a = 1;\n\n      return a;");
    expect(outgoingText("привет 👋  мир")).toBe("привет 👋  мир");
    expect(outgoingText("   \n  ")).toBe("");
  });
});
