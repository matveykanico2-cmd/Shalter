import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { PromotionsSection } from "./promotions-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BASE = { createdBy: "u_admin0001", createdByName: "Админ", createdAt: "2026-10-26T10:00:00.000Z" };
const SPRING = { ...BASE, id: "pr_1", code: "SPRING", prize: "premium", config: { type: "premium", days: 30 }, usesTotal: 10, used: 3 };
const STARS = { ...BASE, id: "pr_2", code: "STARS100", prize: "stars", config: { type: "stars", amount: 100 }, usesTotal: null, used: 1 };

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PromotionsSection />
      <AskHost />
    </QueryClientProvider>
  );
}

describe("«Промокоды»", () => {
  it("пустой список", async () => {
    fakeApi({ "GET /api/promotions/admin": { body: { codes: [] } } });
    renderSection();
    expect(await screen.findByText("Промокодов пока нет")).toBeTruthy();
    expect(screen.getByText("Создавайте промокоды с одноразовой активацией на аккаунт")).toBeTruthy();
  });

  it("создание: код заглавными, звёзды с количеством и лимитом; новый код в списке", async () => {
    let codes: unknown[] = [SPRING];
    const api = fakeApi({
      "GET /api/promotions/admin": () => ({ body: { codes } }),
      "POST /api/promotions/admin/create": () => {
        codes = [STARS, SPRING];
        return { body: { code: { ...STARS, createdByName: undefined } } };
      },
    });
    renderSection();
    expect(await screen.findByText("SPRING")).toBeTruthy();
    expect(screen.getByText("Shalter Premium · 3/10")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Код (оставьте пустым — сгенерируем)"), { target: { value: "stars100" } });
    expect((screen.getByPlaceholderText("Код (оставьте пустым — сгенерируем)") as HTMLInputElement).value).toBe("STARS100");
    expect(screen.getByText("Количество дней в подарок")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Приз" }), { target: { value: "stars" } });
    expect(screen.getByText("Количество звёзд в подарок")).toBeTruthy();
    expect((screen.getByRole("spinbutton", { name: "Количество звёзд" }) as HTMLInputElement).value).toBe("100");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество звёзд" }), { target: { value: "250" } });
    fireEvent.change(screen.getByPlaceholderText("Лимит активаций (оставьте пустым — неограниченно)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать промокод" }));

    expect(await screen.findByText("STARS100")).toBeTruthy();
    expect(screen.getByText("звёзды · без лимита")).toBeTruthy();
    expect(api.calls.find((c) => c.key === "POST /api/promotions/admin/create")?.body).toEqual({
      code: "STARS100",
      prize: "stars",
      config: { amount: 250 },
      usesTotal: 5,
    });
    // Форма сброшена к умолчаниям.
    expect((screen.getByPlaceholderText("Код (оставьте пустым — сгенерируем)") as HTMLInputElement).value).toBe("");
  });

  it("пустой код и лимит — сервер сгенерирует код, лимита нет; ошибка сервера под формой", async () => {
    const api = fakeApi({
      "GET /api/promotions/admin": { body: { codes: [] } },
      "POST /api/promotions/admin/create": { status: 400, body: { error: "Укажите количество дней Premium" } },
    });
    renderSection();
    await screen.findByText("Промокодов пока нет");
    fireEvent.click(screen.getByRole("button", { name: "Создать промокод" }));
    expect(await screen.findByText("Укажите количество дней Premium")).toBeTruthy();
    expect(api.calls.find((c) => c.key === "POST /api/promotions/admin/create")?.body).toEqual({ prize: "premium", config: { days: 30 }, usesTotal: null });
  });

  it("удаление после подтверждения", async () => {
    let codes: unknown[] = [SPRING, STARS];
    const api = fakeApi({
      "GET /api/promotions/admin": () => ({ body: { codes } }),
      "DELETE /api/promotions/admin/pr_1": () => {
        codes = [STARS];
        return { body: { ok: true } };
      },
    });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Удалить SPRING" }));
    const ask = await screen.findByRole("dialog", { name: "Удалить промокод «SPRING»?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(screen.queryByText("SPRING")).toBeNull());
    expect(screen.getByText("STARS100")).toBeTruthy();
    expect(api.calls.some((c) => c.key === "DELETE /api/promotions/admin/pr_1")).toBe(true);
  });
});
