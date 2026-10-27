import { describe, expect, it } from "vitest";

import { maxReactionsPerUser, toggleReaction } from "./reactions";

const ME = "u_me";

describe("реакции (как toggleReaction в server/data/messages.js)", () => {
  it("ставит новую, добавляет себя к чужой, снимает повтором; пустые убираются", () => {
    let r = toggleReaction([], "👍", ME, 1);
    expect(r).toEqual([{ emoji: "👍", userIds: [ME] }]);
    r = toggleReaction([{ emoji: "🔥", userIds: ["u_x"] }], "🔥", ME, 1);
    expect(r).toEqual([{ emoji: "🔥", userIds: ["u_x", ME] }]);
    expect(toggleReaction(r, "🔥", ME, 1)).toEqual([{ emoji: "🔥", userIds: ["u_x"] }]);
    expect(toggleReaction([{ emoji: "👍", userIds: [ME] }], "👍", ME, 1)).toEqual([]);
  });

  it("без Premium одна реакция: новая заменяет старую", () => {
    const before = [
      { emoji: "👍", userIds: [ME, "u_x"] },
      { emoji: "❤️", userIds: ["u_y"] },
    ];
    expect(toggleReaction(before, "❤️", ME, maxReactionsPerUser(false))).toEqual([
      { emoji: "👍", userIds: ["u_x"] },
      { emoji: "❤️", userIds: ["u_y", ME] },
    ]);
  });

  it("с Premium до трёх, четвёртая снимает самую раннюю; исходный список не меняется", () => {
    const before = [
      { emoji: "a", userIds: [ME] },
      { emoji: "b", userIds: [ME] },
      { emoji: "c", userIds: [ME] },
    ];
    const after = toggleReaction(before, "d", ME, maxReactionsPerUser(true));
    expect(after.map((r) => r.emoji)).toEqual(["b", "c", "d"]);
    expect(before[0]!.userIds).toEqual([ME]);
  });
});
