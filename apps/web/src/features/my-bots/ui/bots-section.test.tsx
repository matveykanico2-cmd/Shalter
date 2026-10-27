import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { BotsSection } from "./bots-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TOKEN = "a".repeat(48);
const FRESH = "b".repeat(48);
const BOT = {
  id: "bot_1",
  userId: "bot_1",
  description: "",
  commands: [],
  appUrl: null,
  appName: null,
  appCode: null,
  user: { id: "bot_1", name: "Счётчик", username: "counter_bot", avatarColor: "#f00" },
};

describe("«Боты»", () => {
  it("токен: показать, перевыпустить с подтверждением; переименовать в настройках бота", async () => {
    let name = "Счётчик";
    const { calls } = fakeApi({
      "GET /api/bots": () => ({ body: { bots: [{ ...BOT, user: { ...BOT.user, name } }] } }),
      "GET /api/bots/bot_1/token": { body: { token: TOKEN } },
      "POST /api/bots/bot_1/regenerate-token": { body: { token: FRESH } },
      "PATCH /api/bots/bot_1": (body) => {
        name = String(body.name);
        return { body: { bot: { ...BOT, user: { ...BOT.user, name } } } };
      },
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <BotsSection />
          <AskHost />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("Ваши боты — 1")).toBeTruthy();
    expect(screen.getByText("@counter_bot")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Показать токен" }));
    const shown = await screen.findByRole("dialog", { name: "Токен бота «Счётчик»" });
    expect(within(shown).getByText(TOKEN)).toBeTruthy();
    fireEvent.click(within(shown).getByRole("button", { name: "Готово" }));

    fireEvent.click(screen.getByRole("button", { name: "Обновить токен" }));
    fireEvent.click(await screen.findByRole("button", { name: "Обновить" }));
    expect(await screen.findByText(FRESH)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    fireEvent.click(screen.getByRole("button", { name: "Редактировать бота" }));
    const edit = await screen.findByRole("dialog", { name: "Настройки бота" });
    const nameBox = within(edit).getByText("Имя").nextElementSibling as HTMLInputElement;
    expect(nameBox.value).toBe("Счётчик");
    fireEvent.change(nameBox, { target: { value: "Счётчик Про" } });
    fireEvent.click(within(edit).getByRole("button", { name: "Сохранить" }));
    expect(await within(edit).findByText(/Сохранено$/)).toBeTruthy();
    fireEvent.click(within(edit).getByRole("button", { name: "Закрыть" }));
    expect(await screen.findByText("Счётчик Про")).toBeTruthy();
    expect(calls.find((c) => c.key === "PATCH /api/bots/bot_1")?.body).toMatchObject({ name: "Счётчик Про", username: "counter_bot", appUrl: "" });
  });
});
