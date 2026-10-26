import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeGame, closeGamesCatalog, closeGameScores, openGamesCatalog } from "@/entities/game";
import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { GamesHost } from "./games-host";

const G2048 = { id: "builtin-2048", title: "2048", emoji: "🔢", description: "Складывайте плитки до 2048", builtin: true, isPublic: true };
const SNAKE = { id: "builtin-snake", title: "Змейка", emoji: "🐍", description: "Классика", builtin: true, isPublic: true };

function renderHost() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_alice0000", name: "Алиса" } } as never);
  render(
    <QueryClientProvider client={client}>
      <GamesHost />
    </QueryClientProvider>
  );
}

afterEach(() => {
  act(() => {
    closeGamesCatalog();
    closeGame();
    closeGameScores();
  });
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Игры", () => {
  it("каталог: поиск, «В чат» отдаёт игру, «Играть» открывает игру с рекордами поверх", async () => {
    fakeApi({
      "GET /api/games": { body: { games: [G2048, SNAKE] } },
      "GET /api/games?q=2048": { body: { games: [G2048] } },
      "GET /api/games/builtin-2048": { body: { game: { ...G2048, file: "2048.html", ownerId: null, code: "<p>игра</p>" } } },
      "POST /api/games/builtin-2048/play": { body: {} },
      "GET /api/games/builtin-2048/scores": { body: { scores: [{ userId: "u_boris0000", score: 128, updatedAt: "2026-10-26T10:00:00.000Z", name: "Борис" }] } },
    });
    const picked: string[] = [];
    renderHost();
    act(() => openGamesCatalog({ chatId: null, onPick: (g) => picked.push(g.id) }));
    expect(await screen.findByText("Змейка")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Поиск игр"), { target: { value: "2048" } });
    await vi.waitFor(() => expect(screen.queryByText("Змейка")).toBeNull());

    fireEvent.click(await screen.findByRole("button", { name: "Играть" }));
    expect(await screen.findByTitle("2048")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Рекорды" }));
    expect(await screen.findByRole("heading", { name: "🔢 Рекорды · 2048" })).toBeTruthy();
    expect(await screen.findByText("128")).toBeTruthy();
    // Таблица закрывается, игра остаётся.
    const closes = screen.getAllByRole("button", { name: "Закрыть" });
    fireEvent.click(closes[closes.length - 1]!);
    expect(screen.queryByRole("heading", { name: /Рекорды/ })).toBeNull();
    expect(screen.getByTitle("2048")).toBeTruthy();

    act(() => closeGame());
    fireEvent.click(screen.getByRole("button", { name: "В чат" }));
    expect(picked).toEqual(["builtin-2048"]);
    expect(screen.queryByPlaceholderText("Поиск игр")).toBeNull();
  });
});
