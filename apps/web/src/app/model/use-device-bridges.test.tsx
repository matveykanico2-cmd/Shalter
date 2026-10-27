import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDeviceBridges } from "./use-device-bridges";

type BridgeWindow = Window & { __shalterOpen?: (path: string) => void; shalterDesktop?: unknown };

function Probe() {
  useDeviceBridges();
  return null;
}

const mount = () => {
  const router = createMemoryRouter([{ path: "*", element: <Probe /> }], { initialEntries: ["/"] });
  render(<RouterProvider router={router} />);
  return router;
};

afterEach(() => {
  cleanup();
  delete (window as BridgeWindow).shalterDesktop;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("мосты приложений", () => {
  it("__shalterOpen: экран приложения — без перезагрузки, чужой адрес — никуда", async () => {
    const router = mount();
    (window as BridgeWindow).__shalterOpen!("/chat/c1?answer=1");
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c1"));
    (window as BridgeWindow).__shalterOpen!("https://evil.example/chat/x");
    expect(router.state.location.pathname).toBe("/chat/c1");
  });

  it("нажали на push-уведомление при открытом приложении: переход здесь же и ответ service worker'у", async () => {
    const listeners: ((e: MessageEvent) => void)[] = [];
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn), removeEventListener: () => {} },
    });
    const router = mount();
    const port = { postMessage: vi.fn() };
    listeners.forEach((fn) => fn({ data: { type: "shalter:open", path: "/chat/c2" }, ports: [port] } as unknown as MessageEvent));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c2"));
    expect(port.postMessage).toHaveBeenCalled();
    // Страница сервера (короткая ссылка) — не наша: без ответа SW откроет её сам.
    const other = { postMessage: vi.fn() };
    listeners.forEach((fn) => fn({ data: { type: "shalter:open", path: "/s/abc" }, ports: [other] } as unknown as MessageEvent));
    expect(other.postMessage).not.toHaveBeenCalled();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it("приложение для компьютера: ссылка «в новой вкладке» — своя в окне оболочки, чужая — в браузер", () => {
    const openBrowser = vi.fn();
    (window as BridgeWindow).shalterDesktop = { openBrowser };
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    mount();
    const own = Object.assign(document.createElement("a"), { href: "/games", target: "_blank", textContent: "own" });
    const ext = Object.assign(document.createElement("a"), { href: "https://example.com/x", target: "_blank", textContent: "ext" });
    document.body.append(own, ext);
    own.click();
    ext.click();
    expect(openBrowser).toHaveBeenCalledWith(`${location.origin}/games`);
    expect(open).toHaveBeenCalledWith("https://example.com/x", "_blank", "noopener");
  });
});
