import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeStream, FakeTrack } from "@/shared/lib/test";

import type { CallState } from "../model/call-store";

import { CallScreen } from "./call-screen";

// Раскладку проверяем по самому CSS: jsdom стилей модулей не применяет.
const css = readFileSync(`${import.meta.dirname}/call-screen.module.css`, "utf8");

const ME = { id: "u_me0000000", name: "Аня" };
const BORIS = { id: "u_boris0000", name: "Борис" };

const callState = (over: Partial<CallState> = {}): CallState =>
  ({
    call: { id: "cl_1", chatId: "c_1", kind: "video", callerId: BORIS.id, status: "ongoing", startedAt: "2026-10-26T10:00:00.000Z", durationSec: 0, participantIds: [BORIS.id, ME.id] },
    chatTitle: "Борис",
    chatType: "dm",
    others: [BORIS],
    me: ME,
    isRoom: false,
    phase: "connected",
    elapsed: 5,
    muted: false,
    cameraOn: false,
    facingBack: false,
    switchingCamera: false,
    cameraError: null,
    cameraCount: 1,
    sharing: false,
    screenStream: null,
    remoteMedia: { [BORIS.id]: { camera: true, sharing: false } },
    remoteStreams: { [BORIS.id]: new FakeStream([new FakeTrack("audio"), new FakeTrack("video")]) as unknown as MediaStream },
    remoteCamStreams: {},
    connectedPeers: { [BORIS.id]: true },
    minimized: false,
    localStream: null,
    mediaError: null,
    connectionError: null,
    ...over,
  }) as CallState;

const block = (selector: string) => new RegExp(`(^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`).exec(css)?.[2] ?? "";

let fullscreenElement: Element | null = null;
const requestFullscreen = vi.fn(async () => {
  fullscreenElement = document.documentElement;
  document.dispatchEvent(new Event("fullscreenchange"));
});
const exitFullscreen = vi.fn(async () => {
  fullscreenElement = null;
  document.dispatchEvent(new Event("fullscreenchange"));
});

beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  for (const key of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"]) Reflect.deleteProperty(document, key);
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
});

describe("экран звонка на весь экран", () => {
  it("закрывает всё окно поверх оболочки, с отступами под вырез; шапка и кнопки — поверх видео", () => {
    const screenCss = block(".screen");
    expect(screenCss).toMatch(/position: fixed;/);
    expect(screenCss).toMatch(/inset: 0;/);
    expect(screenCss).toMatch(/height: 100dvh;/);
    // Выше оболочки и панелей (≤ 60), ниже диалогов (100) — меню и подтверждения видны поверх.
    const z = Number(/z-index: (\d+)/.exec(screenCss)?.[1]);
    expect(z).toBeGreaterThan(60);
    expect(z).toBeLessThan(100);
    expect(block(".top")).toMatch(/env\(safe-area-inset-top\)/);
    expect(block(".controls")).toMatch(/env\(safe-area-inset-bottom\)/);
    // Собеседник заполняет экран; «Кадр целиком» — без обрезки.
    expect(block(".tileVideo")).toMatch(/object-fit: cover;/);
    expect(block(".wholeFrame .grid .tileVideo")).toMatch(/object-fit: contain;/);
  });

  it("«На весь экран»: Fullscreen API на весь документ, aria-pressed по состоянию, выход (и по Esc) — снова не нажата", async () => {
    const { container, unmount } = render(<CallScreen s={callState()} me={ME} onMinimize={() => {}} onHangup={() => {}} />);
    const button = screen.getByRole("button", { name: "На весь экран" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    // Видео собеседника — крупно, своё превью — в углу.
    expect(container.querySelector("video")).toBeTruthy();

    await act(async () => fireEvent.click(button));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    // Esc — браузер сам выходит из полноэкранного режима, кнопка это видит.
    act(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(button));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    // Свернули звонок в полноэкранном режиме — из него тоже выходим.
    await act(async () => fireEvent.click(button));
    unmount();
    expect(exitFullscreen).toHaveBeenCalledTimes(2);
  });

  it("без Fullscreen API (iPhone) кнопки нет — экран звонка и так на всё окно", () => {
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    render(<CallScreen s={callState()} me={ME} onMinimize={() => {}} onHangup={() => {}} />);
    expect(screen.queryByRole("button", { name: "На весь экран" })).toBeNull();
    expect(screen.getByTitle("Завершить")).toBeTruthy();
  });

  it("«Кадр целиком» переключает обрезку видео собеседника", () => {
    const { container } = render(<CallScreen s={callState()} me={ME} onMinimize={() => {}} onHangup={() => {}} />);
    const root = container.firstElementChild!;
    const fit = screen.getByRole("button", { name: "Кадр целиком" });
    expect(fit.getAttribute("aria-pressed")).toBe("false");
    expect(root.className).not.toMatch(/wholeFrame/);
    fireEvent.click(fit);
    expect(fit.getAttribute("aria-pressed")).toBe("true");
    expect(root.className).toMatch(/wholeFrame/);
  });
});
