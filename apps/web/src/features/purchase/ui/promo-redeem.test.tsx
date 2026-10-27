import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { PromoRedeem } from "./promo-redeem";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRedeem() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <PromoRedeem />
    </QueryClientProvider>
  );
  return { invalidate };
}

const input = () => screen.getByPlaceholderText("Введите код") as HTMLInputElement;
const button = (name = "Активировать") => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("«Промокод» в разделе Premium", () => {
  it("кнопка включается по введённому коду и снова гаснет, когда поле очистили", () => {
    fakeApi({});
    renderRedeem();
    expect(button().disabled).toBe(true);
    fireEvent.change(input(), { target: { value: "spring" } });
    expect(input().value).toBe("SPRING");
    expect(button().disabled).toBe(false);
    fireEvent.change(input(), { target: { value: "  " } });
    expect(button().disabled).toBe(true);
  });

  it("активировали — сообщение сервера, поле очищено, Premium, звёзды и сессия перечитываются", async () => {
    const api = fakeApi({
      "POST /api/promotions/redeem": { body: { delivered: true, message: "🎉 Вам выдан Shalter Premium на 30 дн. по промокоду!", balance: 0 } },
    });
    const { invalidate } = renderRedeem();
    fireEvent.change(input(), { target: { value: "spring" } });
    fireEvent.click(button());
    expect(await screen.findByText("🎉 Вам выдан Shalter Premium на 30 дн. по промокоду!")).toBeTruthy();
    expect(api.calls).toEqual([{ key: "POST /api/promotions/redeem", body: { code: "SPRING" } }]);
    expect(input().value).toBe("");
    expect(button().disabled).toBe(true);
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(["session", "current"]), JSON.stringify(["premium", "me"]), JSON.stringify(["stars", "info"])]));
  });

  it("ошибка — текст сервера, код остаётся в поле", async () => {
    fakeApi({ "POST /api/promotions/redeem": { status: 400, body: { error: "Вы уже активировали этот промокод" } } });
    renderRedeem();
    fireEvent.change(input(), { target: { value: "SPRING" } });
    fireEvent.click(button());
    expect(await screen.findByText("Вы уже активировали этот промокод")).toBeTruthy();
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(input().value).toBe("SPRING");
  });
});
