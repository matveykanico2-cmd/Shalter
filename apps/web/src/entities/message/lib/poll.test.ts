import { describe, expect, it } from "vitest";

import { applyVote, type PollMeta, pollView, toggleChecklistItem, withAttachmentMeta } from "./poll";

const ME = "u_me";

describe("опрос (PollAttachment и applyLocalVote)", () => {
  it("до голоса — без итогов; после — проценты, лидер, свой голос; голосовать ещё раз нельзя", () => {
    const meta = { options: ["Да", "Нет"], voterIds: [["u_a"], []] };
    expect(pollView(meta, ME)).toMatchObject({ showResults: false, canVote: true, kindLabel: "Опрос", totalVoters: 1 });
    const after = pollView(applyVote(meta, 1, ME), ME);
    expect(after.options.map((o) => [o.pct, o.mine, o.leader])).toEqual([
      [50, false, true],
      [50, true, true],
    ]);
    expect(after).toMatchObject({ showResults: true, canVote: false, answered: true });
  });

  it("несколько ответов: голос переключается; null снимает все свои", () => {
    let meta: PollMeta = { options: ["a", "b", "c"], multiple: true, voterIds: [[], [], []] };
    meta = applyVote(applyVote(meta, 0, ME), 2, ME);
    expect(meta.voterIds).toEqual([[ME], [], [ME]]);
    expect(pollView(meta, ME).canVote).toBe(true);
    meta = applyVote(meta, 0, ME);
    expect(meta.voterIds).toEqual([[], [], [ME]]);
    expect(applyVote(meta, null, ME).votes).toEqual([0, 0, 0]);
  });

  it("викторина: верно / неверно с правильным ответом; закрытый опрос не меняется", () => {
    const quiz = { options: ["2", "4"], correctIndex: 1, voterIds: [[], []] as string[][] };
    expect(pollView(applyVote(quiz, 1, ME), ME)).toMatchObject({ isQuiz: true, gotIt: true, kindLabel: "Викторина" });
    const wrong = pollView(applyVote(quiz, 0, ME), ME);
    expect(wrong).toMatchObject({ gotIt: false, correctText: "4" });
    expect(wrong.options.map((o) => o.mark)).toEqual(["wrong", "correct"]);
    const closed = { ...quiz, closed: true };
    expect(applyVote(closed, 0, ME)).toBe(closed);
    expect(pollView(closed, ME).kindLabel).toBe("Опрос завершён");
  });
});

describe("чек-лист", () => {
  it("отметка ставится и снимается; правится только своё вложение", () => {
    const meta = { items: [{ id: 1, text: "Хлеб" }, { id: 2, text: "Молоко" }] };
    const done = toggleChecklistItem(meta, 2, ME, "2026-10-23T10:00:00.000Z");
    expect(done.items[1]).toEqual({ id: 2, text: "Молоко", doneBy: ME, doneAt: "2026-10-23T10:00:00.000Z" });
    expect(toggleChecklistItem(done, 2, ME).items[1]).toEqual({ id: 2, text: "Молоко" });

    const m = { attachments: [{ kind: "image", url: "/x" }, { kind: "checklist", meta }] };
    const next = withAttachmentMeta(m, "checklist", () => ({ items: [] }));
    expect(next.attachments).toEqual([{ kind: "image", url: "/x" }, { kind: "checklist", meta: { items: [] } }]);
  });
});
