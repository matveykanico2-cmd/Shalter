import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { chatQueries } from "../api/chat-queries";

import { chatCache } from "./chat-cache";
import type { ChatSummary } from "./types";

describe("chatCache.setDraft", () => {
  it("черновик — и в списке, и в карточке открытого чата (поле ввода берёт его оттуда)", () => {
    const client = new QueryClient();
    const chat = { id: "c_1", draft: null } as unknown as ChatSummary;
    client.setQueryData(chatQueries.list().queryKey, [chat]);
    client.setQueryData(chatQueries.card("c_1").queryKey, { chat } as never);

    chatCache.setDraft(client, "c_1", "😀🐻");
    expect(client.getQueryData(chatQueries.list().queryKey)?.[0]?.draft).toBe("😀🐻");
    expect((client.getQueryData(chatQueries.card("c_1").queryKey) as { chat: ChatSummary }).chat.draft).toBe("😀🐻");

    chatCache.setDraft(client, "c_1", "");
    expect((client.getQueryData(chatQueries.card("c_1").queryKey) as { chat: ChatSummary }).chat.draft).toBeNull();
  });
});
