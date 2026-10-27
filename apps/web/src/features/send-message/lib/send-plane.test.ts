import { afterEach, describe, expect, it, vi } from "vitest";

import { planePath, playSendPlane } from "./send-plane";

const input = () => {
  const el = document.createElement("textarea");
  el.getBoundingClientRect = () => new DOMRect(100, 600, 300, 40);
  document.body.appendChild(el);
  return el;
};

afterEach(() => {
  document.documentElement.removeAttribute("data-reduce-motion");
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("самолётик при отправке", () => {
  it("летит к середине ленты и убирается после полёта", () => {
    vi.useFakeTimers();
    const feed = document.createElement("div");
    feed.setAttribute("role", "log");
    feed.setAttribute("aria-label", "Сообщения");
    feed.getBoundingClientRect = () => new DOMRect(0, 0, 400, 500);
    document.body.appendChild(feed);
    expect(playSendPlane(input())).toBe(true);
    const plane = document.body.querySelector("[aria-hidden='true'] span") as HTMLElement;
    expect(plane.querySelector("svg")?.getAttribute("width")).toBe("28");
    expect(plane.style.getPropertyValue("--end-x")).toBe("200px");
    expect(plane.style.getPropertyValue("--end-y")).toBe("250px");
    vi.advanceTimersByTime(800);
    expect(document.body.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("середина пути — со случайным сдвигом в пределах ±50 по x и 80±20 вверх, поворот около −45°", () => {
    const from = new DOMRect(100, 600, 300, 40);
    const to = new DOMRect(0, 0, 400, 500);
    const low = planePath(from, to, () => 0);
    const high = planePath(from, to, () => 0.999999);
    const baseX = low.start[0] + (low.end[0] - low.start[0]) / 2;
    expect(low.mid[0]).toBeCloseTo(baseX - 50);
    expect(high.mid[0]).toBeCloseTo(baseX + 50, 3);
    expect(low.mid[1]).toBeCloseTo(low.start[1] - 100);
    expect(high.mid[1]).toBeCloseTo(low.start[1] - 60, 3);
    expect(low.midRot).toBeCloseTo(-60);
    expect(high.endRot).toBeCloseTo(-35, 3);
  });

  it("анимации выключены в настройках — не летит", () => {
    document.documentElement.setAttribute("data-reduce-motion", "");
    expect(playSendPlane(input())).toBe(false);
    expect(document.body.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("системный prefers-reduced-motion — не летит", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
    expect(playSendPlane(input())).toBe(false);
  });
});
