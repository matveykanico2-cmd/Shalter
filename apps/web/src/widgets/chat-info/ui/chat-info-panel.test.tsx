// Шапка «Информации о чате» в личке: значки собеседника рядом с именем, как
// info-panel-title в public/js/components/infoPanel.js (main2) — галочка,
// разработчик, Premium, статус и метка безопасности («СКАМ», «ФЕЙК»…).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import type { ChatSummary } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { ChatInfoPanel } from "./chat-info-panel";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[], adminSections: [] as string[] } as unknown as SelfUser;

const dm = (other: Record<string, unknown>) =>
  ({
    id: "c_dm",
    type: "dm",
    title: null,
    adminIds: [],
    moderatorIds: [],
    ownerIds: [],
    memberIds: [ME.id, other.id],
    memberTitles: {},
    restrictions: {},
    muted: false,
    mutedUntil: null,
    otherUser: { avatarColor: "#888", online: false, statusIcon: null, statusName: null, ...other },
  }) as unknown as ChatSummary;

function renderPanel(chat: ChatSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/", element: <ChatInfoPanel chat={chat} members={[]} me={ME} onClose={() => {}} /> }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

afterEach(cleanup);

describe("информация о чате: значки собеседника", () => {
  it("метка безопасности из каталога, галочка, разработчик и Premium", async () => {
    fakeApi({
      "GET /api/labels": { body: { labels: [{ id: "scam", short: "СКАМ", label: "Мошенничество", hint: "Не переводите деньги.", color: "" }] } },
    });
    renderPanel(dm({ id: "u_boris0000", name: "Борис", safetyLabel: "scam", isVerified: true, isDeveloper: true, isPremium: true }));
    const panel = screen.getByRole("complementary", { name: "Информация о чате" });
    const badge = await within(panel).findByText("СКАМ");
    await waitFor(() => expect(badge.getAttribute("title")).toBe("Не переводите деньги."));
    expect(within(panel).getByTitle("Подтверждённый аккаунт")).toBeTruthy();
    expect(within(panel).getByRole("img", { name: "Разработчик Shalter" })).toBeTruthy();
    expect(within(panel).getByRole("img", { name: "Shalter Premium" })).toBeTruthy();
  });

  it("встроенная метка, пока каталог не загрузился, и ничего лишнего без меток", async () => {
    fakeApi({});
    renderPanel(dm({ id: "u_boris0000", name: "Борис", safetyLabel: "fake" }));
    expect(await screen.findByText("ФЕЙК")).toBeTruthy();
    cleanup();
    renderPanel(dm({ id: "u_lena00000", name: "Лена" }));
    expect(screen.queryByText("ФЕЙК")).toBeNull();
    expect(screen.queryByRole("img", { name: "Разработчик Shalter" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Shalter Premium" })).toBeNull();
  });
});
