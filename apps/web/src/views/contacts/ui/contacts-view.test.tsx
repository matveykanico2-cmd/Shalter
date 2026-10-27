import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { ContactsView } from "./contacts-view";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] };
const BORIS = { id: "u_boris0000", name: "Борис", username: "boris", avatarColor: "#3390ec", online: false, lastSeen: null };
const VERA = { id: "u_vera00000", name: "Вера", username: "vera", avatarColor: "#3390ec", online: true, lastSeen: null };
const item = (user: typeof BORIS, localName: string | null = null) => ({ id: "ct_1_a", ownerId: ME.id, userId: user.id, addedAt: "2026-10-01T10:00:00.000Z", localName, note: null, user });

function renderContacts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  const router = createMemoryRouter(
    [
      { path: "/contacts", element: <ContactsView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
      { path: "/nearby", element: <p>рядом</p> },
    ],
    { initialEntries: ["/contacts"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <AskHost />
    </QueryClientProvider>
  );
  return { router, client };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Контакты»", () => {
  it("список: в сети — первым, фильтр по имени; переименовать у себя, заблокировать, удалить", async () => {
    let list = [item(BORIS), item(VERA)];
    const { calls } = fakeApi({
      "GET /api/contacts": () => ({ body: { contacts: list } }),
      "POST /api/contacts/rename": (b) => {
        list = list.map((c) => (c.userId === b.userId ? { ...c, localName: String(b.localName) } : c));
        return { body: { ok: true } };
      },
      "POST /api/users/u_boris0000/block": { body: { user: null } },
      "DELETE /api/contacts": (b) => {
        list = list.filter((c) => c.userId !== b.userId);
        return { body: { ok: true } };
      },
    });
    renderContacts();
    expect(await screen.findByText("Контакты — 2")).toBeTruthy();
    const names = screen.getAllByRole("button", { name: /в сети|был|@/ }).map((b) => b.textContent);
    // textContent включает инициал аватара.
    expect(names[0]).toMatch(/^В?Вера/);

    fireEvent.change(screen.getByPlaceholderText("Поиск по имени или номеру"), { target: { value: "никого" } });
    expect(screen.getByText("По запросу «никого» никого нет")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Поиск по имени или номеру"), { target: { value: "бор" } });
    expect(screen.getByText("Найдено — 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Переименовать у себя" }));
    const ask = await screen.findByRole("dialog", { name: "Как записать Борис?" });
    fireEvent.change(within(ask).getByRole("textbox"), { target: { value: "Боря" } });
    fireEvent.click(within(ask).getByRole("button", { name: "OK" }));
    fireEvent.change(screen.getByPlaceholderText("Поиск по имени или номеру"), { target: { value: "" } });
    expect(await screen.findByText("Боря")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/contacts/rename")?.body).toEqual({ userId: BORIS.id, localName: "Боря" });

    fireEvent.click(screen.getAllByRole("button", { name: "Заблокировать" })[1]!);
    await waitFor(() => expect(screen.getByRole("button", { name: "Разблокировать" })).toBeTruthy());
    expect(calls.find((c) => c.key === "POST /api/users/u_boris0000/block")?.body).toEqual({ blocked: true });

    fireEvent.click(screen.getAllByRole("button", { name: "Удалить из контактов" })[1]!);
    expect(await screen.findByText("Контакты — 1")).toBeTruthy();
  });

  it("«Добавить» по юзернейму: «Это вы», не найден, найденный добавляется", async () => {
    let list: ReturnType<typeof item>[] = [];
    const { calls } = fakeApi({
      "GET /api/contacts": () => ({ body: { contacts: list } }),
      "GET /api/users/by-username/anya": { body: { user: { ...ME, isSelf: true } } },
      "GET /api/users/by-username/boris": { body: { user: BORIS } },
      "POST /api/contacts": () => {
        list = [item(BORIS)];
        return { body: {} };
      },
    });
    renderContacts();
    expect(await screen.findByText("Список контактов пуст")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    fireEvent.click(screen.getByRole("button", { name: "По юзернейму" }));
    const box = screen.getByPlaceholderText("@юзернейм");
    fireEvent.change(box, { target: { value: "@anya" } });
    expect(await screen.findByText("Это вы", {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.change(box, { target: { value: "@nobody" } });
    expect(await screen.findByText("Пользователь не найден", {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.change(box, { target: { value: "@boris" } });
    fireEvent.click(await screen.findByRole("button", { name: /Борис\s*@boris/ }, { timeout: 2000 }));
    expect(await screen.findByText("Контакты — 1")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/contacts")?.body).toEqual({ userId: BORIS.id, localName: null, sharePhone: false });
  });

  it("«Найти друзей из контактов»: вставленные номера — найденные сразу в контакты, остальных пригласить", async () => {
    let list: ReturnType<typeof item>[] = [];
    const { calls } = fakeApi({
      "GET /api/contacts": () => ({ body: { contacts: list } }),
      "POST /api/contacts/match": {
        body: { found: [{ user: BORIS, alreadyContact: false, localName: "Боря" }], notFound: [{ phone: "+79990000000", name: "Незнакомец" }], checked: 2 },
      },
      "POST /api/contacts": () => {
        list = [item(BORIS, "Боря")];
        return { body: {} };
      },
    });
    renderContacts();
    fireEvent.click(await screen.findByRole("button", { name: "Найти друзей из контактов" }));
    const dialog = screen.getByRole("dialog", { name: "Друзья из контактов" });
    fireEvent.change(within(dialog).getByPlaceholderText(/\+7 999 111-22-33/), { target: { value: "Боря +79991112233\nНезнакомец +79990000000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Проверить эти номера" }));
    expect(await within(dialog).findByText("Уже в Shalter (1)")).toBeTruthy();
    expect(within(dialog).getByText("Пригласить (1)")).toBeTruthy();
    expect(within(dialog).getByText("добавлен ✓")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/contacts/match")?.body).toEqual({
      contacts: [
        { name: "Боря", phone: "+79991112233" },
        { name: "Незнакомец", phone: "+79990000000" },
      ],
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
    expect(await screen.findByText("Контакты — 1")).toBeTruthy();
  });
});
