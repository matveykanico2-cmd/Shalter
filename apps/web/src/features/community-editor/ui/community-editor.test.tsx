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
import { AddCommunityMembersDialog, AdminsDialog } from "./community-people";
import { CommunitySettingsDialog } from "./community-settings-dialog";
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
    expect(createCall?.body).toEqual({ title: "Дачники", description: "Всё о даче", avatarColor: "#1e88e5", avatarImage: null, addMode: "admins", chatVisible: true });
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

  it("смайл вместо фото: выбрать в «Изменить сообщество», затем убрать", async () => {
    let current: Record<string, unknown> = { ...community, avatarEmoji: null };
    const { calls } = fakeApi({
      "GET /api/communities/cm_dacha0000000": () => ({ body: { community: current } }),
      "PATCH /api/communities/cm_dacha0000000": (body) => {
        current = { ...current, ...(body as object) };
        return { body: { community: current } };
      },
      "GET /api/communities/joined": { body: { communities: [] } },
    });
    const onClose = vi.fn();
    setup(<CommunitySettingsDialog communityId="cm_dacha0000000" meId={ME} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Изменить сообщество" });
    expect(within(dialog).queryByRole("button", { name: "Сохранить" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Смайл/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "🔥" }));
    expect(within(dialog).queryByRole("group", { name: "Смайл на аватарке" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.key.startsWith("PATCH"))?.body).toMatchObject({ avatarEmoji: "🔥", avatarImage: null });
  });

  it("смайл в «Новом сообществе» уходит вместе с названием", async () => {
    const { calls } = fakeApi({
      "GET /api/chats": { body: { chats: [] } },
      "POST /api/communities": { body: { community } },
      "GET /api/communities/joined": { body: { communities: [] } },
    });
    setup(<CreateCommunityDialog onCreated={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Новое сообщество" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Смайл/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "😇" }));
    expect(within(dialog).getByRole("button", { name: /Убрать смайл/ })).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Название сообщества" }), { target: { value: "Дачники" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(await screen.findByText("Сообщество создано")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/communities")?.body).toMatchObject({ title: "Дачники", avatarImage: null, avatarEmoji: "😇" });
  });

  it("добавляет выбранные контакты сразу в участники сообщества", async () => {
    const boris = { id: "u_boris0000", name: "Борис", username: "boris", avatarColor: null, avatarImage: null, avatarEmoji: null };
    const { calls } = fakeApi({
      "GET /api/communities/cm_dacha0000000": { body: { community } },
      "GET /api/communities/cm_dacha0000000/members?q=": { body: { users: [{ ...boris, id: ME, name: "Я", role: "owner" }] } },
      "GET /api/contacts": { body: { contacts: [{ user: boris, localName: null, note: null, sharePhone: false }] } },
      "POST /api/communities/cm_dacha0000000/members": { body: { community: { ...community, membersCount: 2 } } },
      "GET /api/communities/joined": { body: { communities: [] } },
    });
    setup(<AddCommunityMembersDialog community={community as never} meId={ME} onChanged={() => {}} onClose={() => {}} />);
    const people = await screen.findByRole("dialog", { name: "Добавить участников" });
    fireEvent.click(await within(people).findByRole("button", { name: "Выбрать Борис" }));
    fireEvent.click(within(people).getByRole("button", { name: "Добавить (1)" }));
    await waitFor(() => expect(calls.find((call) => call.key === "POST /api/communities/cm_dacha0000000/members")?.body).toEqual({ userIds: [boris.id] }));
  });

  it("показывает системный значок администратора как иконку, а не icon:crown", async () => {
    const admin = { id: "u_admin0000", name: "Админ", username: "admin", avatarColor: null, avatarImage: null, avatarEmoji: null, role: "admin", rights, badge: "icon:crown", title: null };
    fakeApi({
      "GET /api/communities/cm_dacha0000000": { body: { community: { ...community, membersCount: 2, adminsCount: 2 } } },
      "GET /api/communities/cm_dacha0000000/members?q=": { body: { users: [{ ...admin, role: "member" }] } },
      "GET /api/communities/cm_dacha0000000/admins": { body: { admins: [admin] } },
      "GET /api/communities/joined": { body: { communities: [] } },
    });
    setup(<AdminsDialog community={{ ...community, membersCount: 2, adminsCount: 2 } as never} meId={ME} onChanged={() => {}} onClose={() => {}} />);
    const admins = await screen.findByRole("dialog", { name: "Администраторы" });
    expect(admins.textContent).not.toContain("icon:crown");
    fireEvent.click(await within(admins).findByRole("button", { name: /Админ/ }));
    const rightsDialog = await screen.findByRole("dialog", { name: "Права администратора" });
    expect((within(rightsDialog).getByRole("textbox", { name: "Значок (эмодзи)" }) as HTMLInputElement).value).toBe("");
    expect(rightsDialog.textContent).not.toContain("icon:crown");
  });
});
