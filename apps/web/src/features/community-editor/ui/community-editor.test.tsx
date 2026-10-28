import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";
import { communityQueries } from "@/entities/community";

import { fakeApi } from "@/shared/lib/test";
import { Toaster } from "@/shared/ui";

import { AddChatFlow } from "./add-chat-flow";
import { CreateCommunityDialog } from "./create-community-dialog";

const ME = "u_me";
const rights = { editInfo: true, editChats: true, ban: true, addAdmins: true };
const community = { id: "cm_dacha0000000", title: "Дачники", description: null, avatarColor: null, avatarImage: null, addMode: "all", role: "owner", isOwner: true, isMember: true, isBanned: false, rights, addPolicy: "add", pinned: false, collapsed: false, chats: [], isClosed: true, membersCount: 1, adminsCount: 1, bannedCount: 0, requestsCount: 0 };

function setup(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatQueries.list().queryKey, [
    { id: "c_club", type: "group", title: "Клуб садоводов", ownerId: ME, ownerIds: [], adminIds: [], membersCount: 2, archived: false },
    { id: "c_alien", type: "group", title: "Чужая группа", ownerId: "u_x", ownerIds: [], adminIds: [], membersCount: 5, archived: false },
  ] as never);
  client.setQueryData(communityQueries.joined().queryKey, []);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("сообщества", () => {
  it("«Новое сообщество»: название, описание, кто добавляет чаты", async () => {
    const { calls } = fakeApi({
      "GET /api/chats": { body: { chats: [] } },
      "POST /api/communities": { body: { community } },
      "GET /api/communities/joined": { body: { communities: [] } },
    });
    const onCreated = vi.fn();
    setup(<CreateCommunityDialog onCreated={onCreated} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Новое сообщество" });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.key).toEqual("GET /api/chats");
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(calls).toHaveLength(1);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Название сообщества" }), { target: { value: "Дачники" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Описание (необязательно)" }), { target: { value: "Всё о даче" } });
    expect(within(dialog).getByRole("radio", { name: /^Все участники/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Только администраторы/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(await screen.findByText("Сообщество создано")).toBeTruthy();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const createCall = calls.find((c) => c.key.startsWith("POST /api/communities"));
    expect(createCall).toBeDefined();
    expect(createCall?.body).toEqual({ title: "Дачники", description: "Всё о даче", avatarImage: null, addMode: "admins", chatId: null, chatVisible: true });
  });

  it("«Добавить чат»: только свои группы, затем видимость", async () => {
    const { calls } = fakeApi({
      "POST /api/communities/cm_dacha0000000/chats": { body: { community } },
      "GET /api/communities/joined": { body: { communities: [] } },
    });
    const onDone = vi.fn();
    setup(<AddChatFlow community={community as never} meId={ME} onDone={onDone} onClose={() => {}} />);
    const picker = screen.getByRole("dialog", { name: "Добавить чат в сообщество" });
    expect(within(picker).queryByText("Чужая группа")).toBeNull();
    fireEvent.click(within(picker).getByRole("button", { name: /Клуб садоводов/ }));
    const settings = await screen.findByRole("dialog", { name: "Добавить в сообщество" });
    expect(within(settings).getByRole("radio", { name: /^Видимый/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(settings).getByRole("button", { name: "Добавить" }));
    expect(await screen.findByText("Группа добавлена в сообщество")).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({ chatId: "c_club", visible: true });
    expect(onDone).toHaveBeenCalled();
  });
});
