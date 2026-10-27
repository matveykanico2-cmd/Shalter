import { afterEach, describe, expect, it, vi } from "vitest";

import { playWelcome, WELCOME_MS } from "./welcome";

const overlay = () => document.body.querySelector('[role="status"]');

afterEach(() => {
  document.documentElement.removeAttribute("data-reduce-motion");
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("приветствие после входа", () => {
  it("пузырь «Добро пожаловать в Shalter!» и переход не позже чем через 1,2 с", async () => {
    vi.useFakeTimers();
    let done = false;
    const played = playWelcome({ automated: false }).then(() => (done = true));
    expect(overlay()?.textContent).toBe("Добро пожаловать в Shalter!");
    expect(WELCOME_MS).toBeLessThanOrEqual(1200);
    await vi.advanceTimersByTimeAsync(WELCOME_MS);
    await played;
    expect(done).toBe(true);
    expect(overlay()).toBeNull();
  });

  it("в тестах и автотестах — сразу, без экрана", async () => {
    await playWelcome();
    expect(overlay()).toBeNull();
  });

  it("анимации выключены в настройках или системой — сразу, без экрана", async () => {
    document.documentElement.setAttribute("data-reduce-motion", "");
    await playWelcome({ automated: false });
    expect(overlay()).toBeNull();
    document.documentElement.removeAttribute("data-reduce-motion");
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
    await playWelcome({ automated: false });
    expect(overlay()).toBeNull();
  });
});
