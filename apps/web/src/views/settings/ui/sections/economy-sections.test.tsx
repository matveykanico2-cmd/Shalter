import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { AboutSection } from "./about-section";
import { GamesSection } from "./games-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );

describe("«Игры» и «О приложении»", () => {
  it("свои игры: черновик без кода и игра в каталоге", async () => {
    const base = { ownerId: "u_me", description: "", emoji: "🎮", plays: 0, createdAt: "2026-10-26T10:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z" };
    fakeApi({
      "GET /api/games/mine": {
        body: {
          games: [
            { ...base, id: "g_1", title: "Кликер", isPublic: true, hasCode: false },
            { ...base, id: "g_2", title: "Змейка", isPublic: true, hasCode: true, plays: 3 },
          ],
        },
      },
    });
    wrap(<GamesSection />);
    expect(await screen.findByText("Ваши игры — 2")).toBeTruthy();
    expect(screen.getByText("черновик — загрузите код через Game API")).toBeTruthy();
    expect(screen.getByText("в каталоге · 3 запусков")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Играть" })).toHaveLength(2);
  });

  it("версия сервера в «О приложении»", async () => {
    fakeApi({ "GET /api/version": { body: { version: "1.2.3", startedAt: "2026-10-26T10:00:00.000Z" } } });
    wrap(<AboutSection />);
    expect(await screen.findByText("1.2.3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Поддержка — Hugo/ })).toBeTruthy();
  });
});
