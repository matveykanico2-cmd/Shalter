import { describe, expect, it } from "vitest";

import type { History, HistoryPage, Message } from "../model/types";

import { addPending, applyLive, confirmPending, emptyHistory, markRead, mergeLatest, patchMessage, prependOlder, removeMessage, restoreMessage } from "./history";

const msg = (id: string, minute: number, patch: Partial<Message> = {}): Message => ({
  id,
  chatId: "c_1",
  senderId: "u_other",
  type: "text",
  text: id,
  createdAt: `2026-10-22T10:${String(minute).padStart(2, "0")}:00.000Z`,
  pinned: false,
  replyToId: null,
  reactions: [],
  readByIds: [],
  deletedForIds: [],
  mentionedUserIds: [],
  views: null,
  ...patch,
});

const page = (messages: Message[], patch: Partial<HistoryPage> = {}): HistoryPage => ({ messages, hasMore: false, firstUnreadId: null, replyTargets: {}, ...patch });
const ids = (h: History | null) => h?.messages.map((m) => m.id);

describe("лента чата: слияние страниц (как refreshMessages в public/js/views/chatView.js)", () => {
  it("первая страница — как есть", () => {
    const h = mergeLatest(undefined, page([msg("a", 1), msg("b", 2)], { hasMore: true, firstUnreadId: "b" }));
    expect(ids(h)).toEqual(["a", "b"]);
    expect(h.hasMore).toBe(true);
    expect(h.firstUnreadId).toBe("b");
  });

  it("свежая страница не выкидывает подгруженную историю и сохраняет hasMore истории", () => {
    let h = mergeLatest(undefined, page([msg("c", 3), msg("d", 4)], { hasMore: true }));
    h = prependOlder(h, page([msg("a", 1), msg("b", 2)], { hasMore: false }));
    h = mergeLatest(h, page([msg("c", 3), msg("d", 4), msg("e", 5)], { hasMore: true }));
    expect(ids(h)).toEqual(["a", "b", "c", "d", "e"]);
    expect(h.hasMore).toBe(false);
  });

  it("сообщение из события, которого ещё нет в ответе, остаётся до подтверждения", () => {
    let h = mergeLatest(undefined, page([msg("a", 1)]));
    h = applyLive(h, msg("b", 2), true)!;
    h = mergeLatest(h, page([msg("a", 1)]));
    expect(ids(h)).toEqual(["a", "b"]);
    h = mergeLatest(h, page([msg("a", 1), msg("b", 2)]));
    expect(h.unconfirmed).toEqual([]);
    h = mergeLatest(h, page([msg("a", 1)]));
    expect(ids(h)).toEqual(["a"]);
  });

  it("удалённое на сервере пропадает при сверке; временный пузырь остаётся в конце", () => {
    let h = mergeLatest(undefined, page([msg("a", 1), msg("b", 2)]));
    h = addPending(h, msg("local_1", 3, { senderId: "u_me" }));
    h = mergeLatest(h, page([msg("a", 1), msg("c", 4)]));
    expect(ids(h)).toEqual(["a", "c", "local_1"]);
    expect(h.messages.at(-1)?.pending).toBe(true);
  });

  it("пустой ответ — пустая лента", () => {
    const h = mergeLatest(mergeLatest(undefined, page([msg("a", 1)])), page([]));
    expect(ids(h)).toEqual([]);
  });
});

describe("лента чата: события и отправка", () => {
  const base = () => mergeLatest(undefined, page([msg("a", 1), msg("b", 2, { keyboard: { rows: [] } })]));

  it("правка заменяет сообщение; без keyboard — клавиатуру бот убрал", () => {
    const h = applyLive(base(), msg("b", 2, { text: "новый" }), false)!;
    expect(h.messages[1]?.text).toBe("новый");
    expect("keyboard" in h.messages[1]!).toBe(false);
  });

  it("правка незагруженного и сообщение старее последнего — нужна сверка", () => {
    expect(applyLive(base(), msg("zz", 5), false)).toBeNull();
    expect(applyLive(base(), msg("old", 0), true)).toBeNull();
  });

  it("новое — перед временными пузырями", () => {
    const h = applyLive(addPending(base(), msg("local_1", 3)), msg("c", 4), true)!;
    expect(ids(h)).toEqual(["a", "b", "c", "local_1"]);
  });

  it("ответ на отправку заменяет временный пузырь; пришедшее раньше — без дубля", () => {
    let h = addPending(base(), msg("local_1", 3));
    h = confirmPending(h, "local_1", msg("m_real", 3));
    expect(ids(h)).toEqual(["a", "b", "m_real"]);
    expect(h.unconfirmed).toEqual(["m_real"]);

    let raced = addPending(base(), msg("local_2", 3));
    raced = mergeLatest(raced, page([msg("a", 1), msg("b", 2), msg("m_two", 3)]));
    raced = confirmPending(raced, "local_2", msg("m_two", 3));
    expect(ids(raced)).toEqual(["a", "b", "m_two"]);
  });

  it("удаление и прочтение", () => {
    expect(ids(removeMessage(base(), "a"))).toEqual(["b"]);
    const h = markRead(base(), "u_reader", ["b"], "2026-10-22T11:00:00.000Z");
    expect(h.messages[1]?.readByIds).toEqual(["u_reader"]);
    expect(h.messages[1]?.readAt).toBe("2026-10-22T11:00:00.000Z");
    expect(markRead(h, "u_reader", ["b"])).toBe(h);
  });

  it("пустая лента", () => {
    expect(emptyHistory().messages).toEqual([]);
  });
});

describe("лента чата: пустой ответ сверки", () => {
  it("своё неподтверждённое сообщение в пустом чате не задваивается", () => {
    const sent = msg("mine", 1, { senderId: "u_me" });
    const h = confirmPending(addPending(emptyHistory(), msg("local_1", 1, { senderId: "u_me" })), "local_1", sent);
    expect(ids(mergeLatest(h, page([])))).toEqual(["mine"]);
  });
});

describe("лента чата: свои действия и откат", () => {
  const base = (): History => ({ ...emptyHistory(), messages: [msg("a", 1), msg("b", 2), msg("c", 3)] });

  it("правка на месте; чужого id нет — лента та же", () => {
    const h = patchMessage(base(), "b", (m) => ({ ...m, text: "новый" }));
    expect(h.messages[1]!.text).toBe("новый");
    const same = base();
    expect(patchMessage(same, "zzz", (m) => m)).toBe(same);
  });

  it("удалённое возвращается на своё место по времени, временные пузыри остаются в конце", () => {
    const h = addPending(removeMessage(base(), "b"), msg("local_1", 9, { senderId: "u_me" }));
    expect(ids(restoreMessage(h, msg("b", 2)))).toEqual(["a", "b", "c", "local_1"]);
    expect(ids(restoreMessage(removeMessage(base(), "c"), msg("c", 3)))).toEqual(["a", "b", "c"]);
  });

  it("откат правки заменяет сообщение; старше загруженной истории — не вставляем", () => {
    const edited = patchMessage(base(), "a", (m) => ({ ...m, text: "x" }));
    expect(restoreMessage(edited, msg("a", 1)).messages[0]!.text).toBe("a");
    const partial = { ...removeMessage(base(), "a"), hasMore: true };
    expect(ids(restoreMessage(partial, msg("a", 1)))).toEqual(["b", "c"]);
  });
});
