import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { savedProxies } from "../model/saved-proxies";

import { ProxySection } from "./proxy-section";

beforeEach(() => {
  localStorage.clear();
  savedProxies.reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as Window & { shalterDesktop?: unknown }).shalterDesktop;
});

function renderSection(path = "/settings/proxy") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ProxySection />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("«Настройки → Прокси»", () => {
  it("напрямую: добавить ссылку, ошибка на мусоре, список в localStorage, поделиться — QR, удалить", async () => {
    fakeApi({});
    renderSection();
    expect(await screen.findByText("Прямое подключение")).toBeTruthy();
    expect(screen.getByText("Здесь появятся прокси, которые вы добавите.")).toBeTruthy();

    const field = screen.getByRole("textbox", { name: "Ссылка на прокси" });
    fireEvent.change(field, { target: { value: "что-то не то" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(screen.getByText(/Это не похоже на ссылку прокси/)).toBeTruthy();

    fireEvent.change(field, { target: { value: "https://proxy.example.net/?proxy=abcdefgh12" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(await screen.findByText("proxy.example.net")).toBeTruthy();
    expect(screen.getByText("Закрытый, по ссылке с секретом")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("shalter.proxies")!)).toEqual(["https://proxy.example.net/?proxy=abcdefgh12"]);
    expect((field as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Поделиться proxy.example.net" }));
    const dialog = screen.getByRole("dialog", { name: "Поделиться прокси" });
    expect(within(dialog).getByRole("img", { name: "QR-код прокси https://proxy.example.net/?proxy=abcdefgh12" }).innerHTML).toContain("<svg");
    expect(within(dialog).getByText("https://proxy.example.net/?proxy=abcdefgh12")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Готово" }));

    fireEvent.click(screen.getByRole("button", { name: "Удалить proxy.example.net" }));
    expect(screen.getByText("Здесь появятся прокси, которые вы добавите.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("shalter.proxies")!)).toEqual([]);
  });

  it("в браузере «Подключиться» открывает адрес прокси", async () => {
    fakeApi({});
    localStorage.setItem("shalter.proxies", JSON.stringify(["https://p1.example/?proxy=abcdefgh12"]));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: "https://shalter.ru", assign });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Подключиться к p1.example" }));
    expect(assign).toHaveBeenCalledWith("https://p1.example/?proxy=abcdefgh12");
  });

  it("в приложении для компьютера — объясняет, как запустить через прокси", async () => {
    fakeApi({});
    localStorage.setItem("shalter.proxies", JSON.stringify(["https://p1.example/"]));
    (window as Window & { shalterDesktop?: unknown }).shalterDesktop = { openBrowser: vi.fn() };
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Подключиться к p1.example" }));
    const dialog = screen.getByRole("dialog", { name: "Прокси в приложении" });
    expect(within(dialog).getByText("--server-url=https://p1.example/")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Открыть в браузере" })).toBeTruthy();
  });

  it("ссылка из приложения (?url=) подставляется в поле", async () => {
    fakeApi({});
    renderSection(`/settings/proxy?url=${encodeURIComponent("https://p2.example/?proxy=abcdefgh12")}`);
    expect((screen.getByRole("textbox", { name: "Ссылка на прокси" }) as HTMLInputElement).value).toBe("https://p2.example/?proxy=abcdefgh12");
  });

  it("через прокси: «Вы подключены через прокси», QR и сохранение в список", async () => {
    fakeApi({ "GET /api/proxy-info": { body: { proxy: true, link: "https://p3.example/?proxy=abcdefgh12", upstream: "https://shalter.ru", private: true } } });
    renderSection();
    expect(await screen.findByText("Вы подключены через прокси")).toBeTruthy();
    expect(screen.getByText("p3.example")).toBeTruthy();
    expect(screen.getByRole("img", { name: "QR-код прокси https://p3.example/?proxy=abcdefgh12" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить в список" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("shalter.proxies")!)).toEqual(["https://p3.example/?proxy=abcdefgh12"]));
    expect(screen.queryByRole("button", { name: "Сохранить в список" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Поделиться прокси" }));
    expect(screen.getByRole("dialog", { name: "Поделиться прокси" })).toBeTruthy();
  });
});
