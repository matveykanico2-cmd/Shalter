import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("useGuestUiTranslation — экраны входа на языке страны", () => {
  it("язык из GET /api/geo/language переводит экран через /api/translate/ui; уход с экрана выключает перевод", async () => {
    const api = fakeApi({ "GET /api/geo/language": { body: { language: "de", country: "DE", source: "ip" } } });
    const { unmount } = renderHook(() => useGuestUiTranslation(true), { wrapper });
    await waitFor(() => expect(initUiTranslation).toHaveBeenCalledWith("de", { guest: true }));
    expect(api.calls.map((c) => c.key)).toEqual(["GET /api/geo/language"]);
    unmount();
    expect(initUiTranslation).toHaveBeenLastCalledWith("ru");
  });

  it("русский — перевод не включается", async () => {
    const api = fakeApi({ "GET /api/geo/language": { body: { language: "ru", country: "RU", source: "ip" } } });
    renderHook(() => useGuestUiTranslation(true), { wrapper });
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(initUiTranslation).not.toHaveBeenCalled();
  });

  it("со входом язык не запрашивается", async () => {
    const api = fakeApi({});
    renderHook(() => useGuestUiTranslation(false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.calls).toEqual([]);
    expect(initUiTranslation).not.toHaveBeenCalled();
  });

  it("сервер не ответил — интерфейс остаётся русским", async () => {
    const api = fakeApi({ "GET /api/geo/language": { status: 500, body: { error: "boom" } } });
    renderHook(() => useGuestUiTranslation(true), { wrapper });
    await waitFor(() => expect(api.calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(initUiTranslation).not.toHaveBeenCalled();
  });
});
