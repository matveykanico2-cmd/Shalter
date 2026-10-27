import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatSummary } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { ChatHeader } from "./chat-header";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] } as unknown as SelfUser;
const LONG_NAME = "Константин Константинопольский-Многозначительный из Очень Далёкого Города";

function dmWithBadges(): ChatSummary {
  return {
    id: "c_1",
    type: "dm",
    title: "",
    adminIds: [],
    moderatorIds: [],
    ownerIds: [],
    memberIds: [ME.id, "u_kost00000"],
    membersCount: 2,
    memberTitles: {},
    restrictions: {},
    archived: false,
    pinned: false,
    muted: false,
    mutedUntil: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    lastMessage: null,
    unreadCount: 0,
    hasUnreadMention: false,
    secret: true,
    otherUser: {
      id: "u_kost00000",
      name: LONG_NAME,
      avatarColor: "#f00",
      online: true,
      isVerified: true,
      isDeveloper: true,
      isPremium: true,
      statusIcon: "/status/fire.png",
      statusName: "Огонь",
      safetyLabel: "scam",
    },
    draft: null,
  } as unknown as ChatSummary;
}

function renderHeader(chat: ChatSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "*", element: <ChatHeader chat={chat} members={[]} me={ME} typing={null} onSearch={() => {}} infoOpen={false} onInfo={() => {}} /> }]);
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("ChatHeader", () => {
  beforeEach(() => {
    fakeApi({});
  });
  afterEach(cleanup);

  // «В чате имя вообще не видно, если значки премиум и т.д.»: имя — отдельный первый
  // элемент заголовка (он сокращается многоточием), значки идут после него.
  it("длинное имя со всеми значками остаётся в шапке первым, значки — после", () => {
    renderHeader(dmWithBadges());
    const heading = screen.getByRole("heading", { level: 1 });
    const name = within(heading).getByText(LONG_NAME);
    expect(name.textContent).toBe(LONG_NAME);
    const nameBox = [...heading.children].find((c) => c.contains(name))!;
    expect(nameBox).toBeTruthy();
    const after = [...heading.children].slice([...heading.children].indexOf(nameBox) + 1);
    expect(after.some((c) => c.getAttribute("title") === "Аккаунт подтверждён администрацией Shalter")).toBe(true);
    expect(after.some((c) => c.getAttribute("title") === "Разработчик Shalter")).toBe(true);
    expect(after.some((c) => c.getAttribute("title") === "Shalter Premium")).toBe(true);
    expect(after.some((c) => c.getAttribute("title") === "Огонь")).toBe(true);
    expect(within(heading).getByText("СКАМ")).toBeTruthy();
  });
});
