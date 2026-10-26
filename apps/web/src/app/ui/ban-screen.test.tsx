import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { fakeApi, fakeSocket } from "@/shared/lib/test";

import { App } from "../app";

beforeEach(() => {
  fakeSocket();
  localStorage.setItem("shalter.permissionsAsked", "1");
});

afterEach(() => {
  ws.stop();
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("заблокированный: 403 banned на защищённом запросе — вместо приложения экран блокировки с причиной и сроком", async () => {
  const until = new Date(Date.now() + 7 * 86400_000).toISOString();
  fakeApi({
    "GET /api/auth/session": { body: { user: { id: "u_test12345", name: "Борис" }, accounts: [] } },
    "GET /api/bootstrap": { status: 403, body: { error: "banned", banReason: "Рассылка спама", bannedAt: new Date().toISOString(), bannedUntil: until } },
  });
  render(<App />);
  const screenEl = await screen.findByRole("alertdialog", { name: "Аккаунт заблокирован" });
  expect(within(screenEl).getByText("Рассылка спама")).toBeTruthy();
  expect(within(screenEl).getByText(/^Заблокирован до /)).toBeTruthy();
  expect(within(screenEl).getByText(/^Осталось (6 дней 23 часа|7 дней)$/)).toBeTruthy();
  expect(within(screenEl).getByRole("button", { name: "Назад" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Чаты" })).toBeNull();
});
