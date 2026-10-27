import { describe, expect, it } from "vitest";

import { renderCustomScene, sanitizeCustomScene, sceneSummaryEmoji } from "./custom-scene";

describe("сцена своего эмодзи (customScene.js)", () => {
  it("лишнее отбрасывается, числа зажимаются в пределы", () => {
    const scene = sanitizeCustomScene({ loop: 99, bg: "#ABC", layers: [{ type: "circle", x: 500, r: 0 }, { type: "boom" }, { type: "emoji", emoji: "🐱" }] });
    expect(scene.loop).toBe(12);
    expect(scene.bg).toBe("#abc");
    expect(scene.layers.map((l) => l.type)).toEqual(["circle", "emoji"]);
    expect(scene.layers[0]).toMatchObject({ x: 100, r: 1 });
    expect(sceneSummaryEmoji(scene)).toBe("🐱");
    expect(sanitizeCustomScene(null)).toEqual({ v: 1, loop: 3, bg: null, layers: [] });
  });

  it("рисуется в SVG: фон, фигуры, анимации слоёв", () => {
    const svg = renderCustomScene({ bg: "#ffffff", layers: [{ type: "star", anim: "spin" }, { type: "text", text: "Hi" }] }, { size: 40 });
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg.style.width).toBe("40px");
    expect(svg.querySelectorAll("rect")).toHaveLength(1);
    expect(svg.querySelector(".ce-spin path")).toBeTruthy();
    expect(svg.querySelector("text")?.textContent).toBe("Hi");
  });
});
