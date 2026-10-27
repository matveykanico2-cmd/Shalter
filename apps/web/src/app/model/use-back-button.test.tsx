import { cleanup, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleHardwareBack, useBackButton } from "./use-back-button";

type BackWindow = Window & { __shalterBack?: () => boolean };

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("«Назад» в Android-приложении", () => {
  it("открыто окно — его закрывает Escape, экран не меняется", () => {
    const navigate = vi.fn();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    const onKey = vi.fn((e: KeyboardEvent) => e.key === "Escape" && dialog.remove());
    document.addEventListener("keydown", onKey);
    window.history.replaceState({ idx: 3 }, "", "/chat/c1");

    expect(handleHardwareBack(navigate)).toBe(true);
    expect(onKey).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onKey);
  });

  it("панель, которая только останавливает Escape, тоже считается закрытой", () => {
    const navigate = vi.fn();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && e.stopPropagation();
    document.addEventListener("keydown", onKey, true);
    window.history.replaceState({ idx: 0 }, "", "/settings/privacy");
    expect(handleHardwareBack(navigate)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onKey, true);
  });

  it("закрывать нечего: с открытого напрямую экрана — на главный, с главного — false (приложение в фон)", () => {
    const navigate = vi.fn();
    window.history.replaceState({ idx: 0 }, "", "/chat/c1");
    expect(handleHardwareBack(navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });

    window.history.replaceState({ idx: 0 }, "", "/");
    expect(handleHardwareBack(vi.fn())).toBe(false);
  });

  it("есть своя история — назад по ней", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState({ idx: 2 }, "", "/contacts");
    expect(handleHardwareBack(vi.fn())).toBe(true);
    expect(back).toHaveBeenCalled();
    back.mockRestore();
  });

  it("мост window.__shalterBack есть, пока приложение открыто; на экране блокировки — false", () => {
    function Probe({ locked }: { locked: boolean }) {
      useBackButton(locked);
      return null;
    }
    const make = (locked: boolean) => createMemoryRouter([{ path: "*", element: <Probe locked={locked} /> }], { initialEntries: ["/chat/c1"] });
    const { unmount } = render(<RouterProvider router={make(true)} />);
    expect((window as BackWindow).__shalterBack?.()).toBe(false);
    unmount();
    expect((window as BackWindow).__shalterBack).toBeUndefined();
  });
});
