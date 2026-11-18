import { describe, expect, it } from "vitest";

import { votePoll } from "./message-edits.js";

describe("многошаговые опросы", () => {
  it("сохраняет ответ на первый вопрос внутри questions после ответа сервера", () => {
    const message = {
      id: "m_1",
      chatId: "c_1",
      senderId: "u_sender",
      type: "text",
      text: "Опрос",
      createdAt: new Date().toISOString(),
      pinned: false,
      replyToId: null,
      attachments: [
        {
          kind: "poll",
          meta: {
            options: ["Старый вариант"],
            questions: [
              { question: "Первый", options: ["Да", "Нет"], voterIds: [[], []], votes: [0, 0] },
              { question: "Второй", options: ["А", "Б"], voterIds: [[], []], votes: [0, 0] },
            ],
          },
        },
      ],
      reactions: [],
      readByIds: [],
      deletedForIds: [],
      mentionedUserIds: [],
    } as never;

    const next = votePoll(message, 1, "u_me", 0);
    const poll = (next.attachments?.[0] as { meta: { questions: Array<{ voterIds?: string[][]; votes?: number[] }> } }).meta;
    expect(poll.questions[0]?.voterIds).toEqual([[], ["u_me"]]);
    expect(poll.questions[0]?.votes).toEqual([0, 1]);
    expect(poll.questions[1]?.votes).toEqual([0, 0]);
  });
});
