import { afterEach, expect, it, vi } from "vitest";

import { renderAnimatedEmoji } from "./animated-emoji";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("анимированный смайл остаётся на видимом кадре после завершения", async () => {
  vi.useFakeTimers();
  const events = new Map<string, () => void>();
  const stop = vi.fn();
  const animation = {
    totalFrames: 100, isLoaded: true, isPaused: false,
    play: vi.fn(), destroy: vi.fn(), goToAndPlay: vi.fn(), goToAndStop: stop,
    addEventListener: (name: string, fn: () => void) => events.set(name, fn),
  };
  vi.stubGlobal("lottie", { loadAnimation: () => animation });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  document.body.append(renderAnimatedEmoji("🔥", { replay: true }));
  await vi.waitFor(() => expect(events.has("complete")).toBe(true));
  events.get("complete")!();
  expect(stop).toHaveBeenCalledWith(59, true);
  document.body.replaceChildren();
  await vi.advanceTimersByTimeAsync(3000);
});
