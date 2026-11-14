import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openGiftShop } = vi.hoisted(() => ({ openGiftShop: vi.fn() }));
vi.mock("@/entities/gift", () => ({ openGiftShop }));

import { HolidayBanner } from "./holiday-banner";

afterEach(() => {
  cleanup();
  localStorage.clear();
  openGiftShop.mockReset();
  vi.useRealTimers();
});

describe("HolidayBanner", () => {
  it("показывает дату и праздник и открывает существующую отправку подарка", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T12:00:00+03:00"));

    render(<HolidayBanner />);

    expect(screen.getByRole("status", { name: "Сегодня День Победы" }).textContent).toContain("9 мая 2026 г.");
    fireEvent.click(screen.getByRole("button", { name: "Отправить подарок" }));
    expect(openGiftShop).toHaveBeenCalledWith({});
  });

  it("после скрытия не появляется повторно в тот же праздник", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00+03:00"));

    const first = render(<HolidayBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Скрыть" }));
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();

    render(<HolidayBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
