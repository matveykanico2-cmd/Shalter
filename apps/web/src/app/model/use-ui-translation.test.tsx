import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setGuestLanguage } from "@/shared/lib/guest-language";
import { fakeApi } from "@/shared/lib/test";

import { useGuestUiTranslation } from "./use-ui-translation";

const { initUiTranslation } = vi.hoisted(() => ({ initUiTranslation: vi.fn() }));
vi.mock("@/shared/lib/ui-translate", () => ({ initUiTranslation }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => initUiTranslation.mockClear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useGuestUiTranslation — экраны входа на русском, другой язык — по выбору", () => {
  beforeEach(() => setGuestLanguage("ru"));

  it("по умолчанию русский: ни перевода, ни запроса языка по IP", async () => {
    const api = fakeApi({});
    renderHook(() => useGuestUiTranslation(true), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.calls).toEqual([]);
    expect(initUiTranslation).not.toHaveBeenCalled();
  });

  it("выбрали English — экран переводится через /api/translate/ui; уход с экрана выключает перевод", async () => {
    const { unmount } = renderHook(() => useGuestUiTranslation(true), { wrapper });
    act(() => setGuestLanguage("en"));
    await waitFor(() => expect(initUiTranslation).toHaveBeenCalledWith("en", { guest: true }));
    unmount();
    expect(initUiTranslation).toHaveBeenLastCalledWith("ru");
  });

  it("со входом перевод экрана входа не включается", async () => {
    setGuestLanguage("en");
    renderHook(() => useGuestUiTranslation(false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(initUiTranslation).not.toHaveBeenCalled();
  });
});
