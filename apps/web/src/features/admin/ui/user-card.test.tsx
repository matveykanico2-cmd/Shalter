import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { UserCard } from "./user-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const USER = { id: "u_boris0001", name: "Борис", username: "boris", twoFactorEnabled: true };

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_admin0001", name: "Админ", adminSections: ["moderation"] } } as never);
  render(
    <QueryClientProvider client={client}>
      <UserCard user={USER} onClose={() => {}} />
      <AskHost />
    </QueryClientProvider>
  );
}

async function answer(title: RegExp, value: string) {
  const ask = await screen.findByRole("dialog", { name: title });
  fireEvent.change(within(ask).getByRole("textbox"), { target: { value } });
  fireEvent.click(within(ask).getByRole("button", { name: "OK" }));
}

describe("карточка пользователя: «Снять 2FA»", () => {
  it("подтверждение @handle и основание уходят в POST /disable-2fa", async () => {
    const api = fakeApi({
      "GET /api/admin/users/u_boris0001/reports": { status: 500, body: { error: "нет" } },
      "GET /api/labels": { body: { labels: [] } },
      "POST /api/admin/users/u_boris0001/disable-2fa": { body: { ok: true, twoFactorLifted: true } },
    });
    renderCard();
    const card = await screen.findByRole("dialog", { name: "Управление: Борис" });
    fireEvent.click(within(card).getByRole("button", { name: "Снять 2FA" }));
    await answer(/^Снять двухфакторную аутентификацию с Борис\?/, "@boris");
    await answer(/^Основание/, "  Потерял телефон, заявка №5  ");
    expect(await within(card).findByText("✅ Двухфакторная аутентификация снята")).toBeTruthy();
    expect(api.calls.find((c) => c.key === "POST /api/admin/users/u_boris0001/disable-2fa")?.body).toEqual({
      confirm: "@boris",
      reason: "Потерял телефон, заявка №5",
    });
  });

  it("2FA не была включена — так и говорим", async () => {
    fakeApi({
      "GET /api/admin/users/u_boris0001/reports": { status: 500, body: { error: "нет" } },
      "GET /api/labels": { body: { labels: [] } },
      "POST /api/admin/users/u_boris0001/disable-2fa": { body: { ok: true, twoFactorLifted: false } },
    });
    renderCard();
    const card = await screen.findByRole("dialog", { name: "Управление: Борис" });
    fireEvent.click(within(card).getByRole("button", { name: "Снять 2FA" }));
    await answer(/^Снять двухфакторную/, "@boris");
    await answer(/^Основание/, "Заявка");
    expect(await within(card).findByText("✅ У пользователя не включена 2FA")).toBeTruthy();
  });
});
