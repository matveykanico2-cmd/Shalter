import { describe, expect, it } from "vitest";

import { applyAll, applyFix, cleanMatches, type ProofMatch } from "./hugo";

const match = (offset: number, length: number, replacements: string[]): ProofMatch => ({ offset, length, replacements, message: "", short: "", type: "spelling" });

describe("hugo", () => {
  it("пересекающиеся находки — только первая", () => {
    expect(cleanMatches([match(5, 3, []), match(0, 6, []), match(9, 1, [])]).map((m) => m.offset)).toEqual([0, 9]);
  });
  it("исправить одну и все", () => {
    const text = "превет как дила";
    const ms = [match(0, 6, ["привет"]), match(11, 4, ["дела"])];
    expect(applyFix(text, ms[0]!, "привет")).toEqual({ text: "привет как дила", caret: 6 });
    expect(applyAll(text, ms)).toBe("привет как дела");
  });
});
