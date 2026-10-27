import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "../lib/test";

import { BrowserHost } from "./browser-host";
import { openInAppBrowser, openInstantView } from "./browser-store";

const check = (url: string) => `GET /api/link-check?url=${encodeURIComponent(url)}`;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("встроенный браузер", () => {
  it("сайт, который разрешает фрейм, — внутри; предупреждение — полосой", async () => {
    fakeApi({ [check("https://bit.ly/x")]: { body: { frameable: true } } });
    render(<BrowserHost />);
    act(() => openInAppBrowser("https://bit.ly/x", { warning: "Сокращённая ссылка — настоящий адрес скрыт" }));
    expect(screen.getByText("Загрузка…")).toBeTruthy();
    expect((await screen.findByTitle("bit.ly")).getAttribute("src")).toBe("https://bit.ly/x");
    expect(screen.getByText("Сокращённая ссылка — настоящий адрес скрыт")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("сайт запрещает фрейм — объяснение и «Открыть в браузере»", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fakeApi({ [check("https://a.ru/")]: { body: { frameable: false } } });
    render(<BrowserHost />);
    act(() => openInAppBrowser("https://a.ru/"));
    expect(await screen.findByText("Этот сайт не разрешает открывать себя внутри других приложений.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Открыть в браузере" }));
    expect(open).toHaveBeenCalledWith("https://a.ru/", "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("проверка не удалась — можно попробовать здесь; ролик — сразу плеером; GitHub — сразу снаружи", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fakeApi({});
    render(<BrowserHost />);
    act(() => openInAppBrowser("https://a.ru/"));
    fireEvent.click(await screen.findByRole("button", { name: "Попробовать открыть здесь" }));
    expect(screen.getByTitle("a.ru")).toBeTruthy();

    act(() => openInAppBrowser("https://youtu.be/abc"));
    expect(screen.getByTitle("youtu.be").getAttribute("src")).toBe("https://www.youtube.com/embed/abc");

    act(() => openInAppBrowser("https://github.com/x"));
    expect(open).toHaveBeenCalledWith("https://github.com/x", "_blank", "noopener,noreferrer");
  });

  it("Instant View — статья блоками; «Открыть сайт» — в браузер", async () => {
    const url = "https://news.ru/a";
    fakeApi({
      [`GET /api/link-check/instant-view?url=${encodeURIComponent(url)}`]: {
        body: {
          view: {
            url,
            title: "Заголовок",
            siteName: "Новости",
            author: "Иван",
            publishedAt: "2026-10-01T10:00:00Z",
            image: null,
            blocks: [
              { type: "heading", text: "Часть 1" },
              { type: "text", text: "Текст статьи" },
              { type: "item", text: "пункт" },
            ],
          },
        },
      },
      [check(url)]: { body: { frameable: true } },
    });
    render(<BrowserHost />);
    act(() => openInstantView(url));
    expect(await screen.findByRole("heading", { name: "Заголовок" })).toBeTruthy();
    expect(screen.getByText("Иван · 1 октября 2026 г.")).toBeTruthy();
    expect(screen.getByText("• пункт")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Открыть сайт" }));
    expect(await screen.findByTitle("news.ru")).toBeTruthy();
  });
});
