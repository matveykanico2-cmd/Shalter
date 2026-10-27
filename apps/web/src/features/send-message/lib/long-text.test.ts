import { describe, expect, it } from "vitest";

import { splitLongText } from "./long-text";

describe("splitLongText", () => {
  it("короткий — как есть", () => expect(splitLongText("привет")).toEqual(["привет"]));
  it("режет по строке, потом по пробелу, потом по пределу", () => {
    expect(splitLongText("aaaaaa\nbbb", 8)).toEqual(["aaaaaa", "bbb"]);
    expect(splitLongText("aaaaa bbbbb", 8)).toEqual(["aaaaa", "bbbbb"]);
    expect(splitLongText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});
