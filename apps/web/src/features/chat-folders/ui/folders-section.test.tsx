import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";

import { fakeApi } from "@/shared/lib/test";

import { FoldersSection } from "./folders-section";

const GROUP = { id: "c_group0001", type: "group", title: "Проект" };
const DM = { id: "c_dm0000001", type: "dm", title: null, otherUser: { id: "u_lena00000", name: "Лена" } };

function renderFolders(folders: unknown[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatQueries.folders().queryKey, folders as never);
  client.setQueryData(chatQueries.list().queryKey, [GROUP, DM] as never);
  render(
    <QueryClientProvider client={client}>
      <FoldersSection />
    </QueryClientProvider>
  );
  return client;
}

// Списки при открытии перезапрашиваются (GET) — проверяем только изменения.
const writes = (calls: { key: string }[]) => calls.filter((c) => !c.key.startsWith("GET "));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Папки с чатами»", () => {
  it("создание папки и добавление чата: вкладки списка видят её сразу", async () => {
    const folder = { id: "f_work00001", ownerId: "u_me0000000", name: "Работа", order: 0, chatIds: [] as string[] };
    const api = fakeApi({
      "GET /api/folders": { body: { folders: [] } },
      "GET /api/chats": { body: { chats: [GROUP, DM] } },
      "POST /api/folders": { body: { folder } },
      "PATCH /api/folders/f_work00001": (body) => ({ body: { folder: { ...folder, ...body } } }),
    });
    const client = renderFolders();
    fireEvent.click(screen.getByRole("button", { name: "Создать папку" }));
    fireEvent.change(screen.getByPlaceholderText("Название папки"), { target: { value: " Работа " } });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    // Сразу открывается редактор новой папки.
    expect(await screen.findByText("Чаты в папке — 0")).toBeTruthy();
    expect(writes(api.calls)[0]).toEqual({ key: "POST /api/folders", body: { name: "Работа", chatIds: [] } });

    fireEvent.click(screen.getByRole("checkbox", { name: /Проект/ }));
    expect(await screen.findByText("Чаты в папке — 1")).toBeTruthy();
    await waitFor(() => expect(writes(api.calls)[1]).toEqual({ key: "PATCH /api/folders/f_work00001", body: { chatIds: [GROUP.id] } }));
    expect(client.getQueryData(chatQueries.folders().queryKey)).toEqual([{ ...folder, chatIds: [GROUP.id] }]);
  });

  it("порядок: «Ниже» меняет местами и сохраняет order у всех", async () => {
    const a = { id: "f_a00000001", ownerId: "u_me0000000", name: "А", order: 0, chatIds: [] };
    const b = { id: "f_b00000001", ownerId: "u_me0000000", name: "Б", order: 1, chatIds: [] };
    const api = fakeApi({
      "GET /api/folders": { body: { folders: [a, b] } },
      "GET /api/chats": { body: { chats: [GROUP, DM] } },
      "PATCH /api/folders/f_a00000001": { body: { folder: a } },
      "PATCH /api/folders/f_b00000001": { body: { folder: b } },
    });
    const client = renderFolders([a, b]);
    fireEvent.click(screen.getAllByRole("button", { name: "Ниже" })[0]!);
    await waitFor(() => expect(writes(api.calls)).toHaveLength(2));
    expect(writes(api.calls)).toEqual([
      { key: "PATCH /api/folders/f_b00000001", body: { order: 0 } },
      { key: "PATCH /api/folders/f_a00000001", body: { order: 1 } },
    ]);
    expect(client.getQueryData(chatQueries.folders().queryKey)?.map((f) => f.name)).toEqual(["Б", "А"]);
  });
});
