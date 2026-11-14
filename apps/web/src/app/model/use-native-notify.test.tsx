import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { ws } from "@/shared/api";
import { FakeSocket, fakeSocket } from "@/shared/lib/test";

import { useNativeNotify } from "./use-native-notify";

type DesktopWindow = Window & { shalterDesktop?: { notify: ReturnType<typeof vi.fn> } };

const incoming = (chatId: string) => ({
  type: "message:new",
  chatId,
  message: {
    id: `m_${chatId}`,
    chatId,
    senderId: "u_other0000",
    type: "text",
    text: `Сообщение ${chatId}`,
    createdAt: new Date().toISOString(),
  },
});

beforeEach(() => {
  fakeSocket();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  ws.stop();
  cleanup();
  delete (window as DesktopWindow).shalterDesktop;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("уведомления нативного приложения", () => {
  it("не показывает push открытого чата, но показывает сообщение из другого чата", () => {
    const notify = vi.fn();
    (window as DesktopWindow).shalterDesktop = { notify };
    window.history.replaceState(null, "", "/chat/pasha");
    const client = new QueryClient();
    client.setQueryData(chatQueries.list().queryKey, [
      { id: "pasha", title: "Паша", muted: false, mutedUntil: null },
      { id: "other", title: "Другой чат", muted: false, mutedUntil: null },
    ] as ChatSummary[]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/chat/pasha"]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
    renderHook(() => useNativeNotify("u_me0000000"), { wrapper });
    ws.start();
    act(() => FakeSocket.last().open());

    act(() => FakeSocket.last().receive(incoming("pasha")));
    expect(notify).not.toHaveBeenCalled();

    act(() => FakeSocket.last().receive(incoming("other")));
    expect(notify).toHaveBeenCalledWith("Другой чат", "Сообщение other", `${location.origin}/chat/other`);
  });
});
