import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { ModerationSection } from "./moderation-section";

const USER = {
  id: "u_boris0001",
  name: "Борис",
  username: "boris",
  phone: null,
  email: null,
  safetyLabel: null,
  isBanned: false,
  isVerified: false,
  isPremium: false,
  premiumUntil: null,
  premiumForever: false,
  isBusiness: false,
  businessUntil: null,
  businessForever: false,
  isAdsActive: false,
  adsUntil: null,
  adsForever: false,
  adminSections: [],
};
const BANNED = { ...USER, isBanned: true, bannedAt: "2026-10-26T10:00:00.000Z", bannedUntil: "2026-11-02T10:00:00.000Z", banReason: "Спам" };
const LABELS = [{ id: "scam", short: "СКАМ", label: "Мошенничество", hint: "Не переводите деньги", color: "#c6403b", createdAt: "2026-01-01T00:00:00.000Z" }];
const REPORT = {
  id: "rp_1",
  at: "2026-10-26T09:00:00.000Z",
  status: "open",
  reason: "scam",
  reasonLabel: "Мошенничество",
  details: "Просит деньги",
  targetType: "message",
  quoted: "Удвою деньги",
  reporter: { ...USER, id: "u_alice0001", name: "Алиса" },
  subject: USER,
};

function renderModeration() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_admin0001", name: "Админ", isDeveloper: true, isPrimaryAdmin: true, adminSections: [] } } as never);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ModerationSection />
        <AskHost />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Модерация»", () => {
  it("жалобы и очередь рекламы; карточка из поиска: блокировка на 7 дней с причиной и метка «СКАМ»", async () => {
    const api = fakeApi({
      "GET /api/admin/moderation": { body: { openReports: [REPORT], banned: [], labeled: [], labels: LABELS, statusCatalog: [] } },
      "GET /api/ads/review": { body: { campaigns: [], placements: { chats: "Список чатов", chat: "В каналах", discover: "Каталог каналов", profile: "Профиль" } } },
      "GET /api/admin/lookup?q=%40boris": { body: { user: { id: USER.id, name: USER.name, username: "boris", phone: null, email: null } } },
      "GET /api/admin/users/u_boris0001/reports": { body: { user: { ...USER, bannedAt: null, banReason: null, bannedUntil: null }, reports: [] } },
      "GET /api/labels": { body: { labels: LABELS } },
      "GET /api/gifts": { body: { gifts: [], balance: 0 } },
      "POST /api/admin/users/u_boris0001/ban": { body: { user: BANNED } },
      "POST /api/admin/users/u_boris0001/label": { body: { user: { ...USER, safetyLabel: "scam", safetyLabelAt: "2026-10-26T10:00:00.000Z" } } },
    });
    renderModeration();

    expect(await screen.findByText("Открытые жалобы (1)")).toBeTruthy();
    expect(screen.getByText("На: Борис · от: Алиса")).toBeTruthy();
    expect(screen.getByText("«Удвою деньги»")).toBeTruthy();
    expect(screen.getByText("Пояснение: Просит деньги")).toBeTruthy();
    expect(await screen.findByText("Реклама на проверке (0)")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("@юзернейм, +7…, почта или id"), { target: { value: "@boris" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Найти любой аккаунт" })).getByRole("button", { name: "Открыть карточку" }));
    const card = await screen.findByRole("dialog", { name: "Управление: Борис" });

    fireEvent.click(within(card).getByRole("button", { name: "7 дней" }));
    const ask = await screen.findByRole("dialog", { name: /^Блокировка Борис: 7 дней/ });
    fireEvent.change(within(ask).getByRole("textbox"), { target: { value: "Рассылка спама" } });
    fireEvent.click(within(ask).getByRole("button", { name: "OK" }));
    expect(await within(card).findByText(/Аккаунт заблокирован — пользователь уведомлён/)).toBeTruthy();
    expect(within(card).getByText(/^Заблокирован .* до .*\. Причина: Спам$/)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Разблокировать" })).toBeTruthy();
    expect(api.calls.find((c) => c.key === "POST /api/admin/users/u_boris0001/ban")?.body).toEqual({ banned: true, reason: "Рассылка спама", durationSec: 7 * 86400 });

    await waitFor(() => expect(within(card).getByRole("button", { name: "Мошенничество" })).toBeTruthy());
    fireEvent.click(within(card).getByRole("button", { name: "Мошенничество" }));
    expect(await within(card).findByText(/Метка установлена/)).toBeTruthy();
    expect(within(card).getByText("СКАМ")).toBeTruthy();
  });
});
