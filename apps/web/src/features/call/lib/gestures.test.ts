import { describe, expect, it } from "vitest";

import { fingerStates, GestureGate, GESTURES, type HandPoint, recognizeGesture } from "./gestures";

type Fingers = { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean };

/**
 * Синтетическая рука MediaPipe (21 точка, координаты 0…1, y растёт вниз): ладонь у (0.5, 0.7),
 * разогнутый палец уходит вверх (кончик выше среднего сустава), согнутый — кончик ниже его.
 * Большой палец: разогнут — кончик далеко вбок по x, согнут — кончик у основания.
 */
function hand(f: Fingers, tweak: (pts: HandPoint[]) => void = () => {}): HandPoint[] {
  const pts: HandPoint[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7 }));
  pts[0] = { x: 0.5, y: 0.8 };
  pts[1] = { x: 0.45, y: 0.75 };
  pts[2] = { x: 0.42, y: 0.7 }; // основание большого
  pts[3] = { x: 0.38, y: 0.66 };
  pts[4] = f.thumb ? { x: 0.3, y: 0.62 } : { x: 0.42, y: 0.66 };
  const columns: [keyof Fingers, number, number][] = [
    ["index", 5, 0.45],
    ["middle", 9, 0.5],
    ["ring", 13, 0.55],
    ["pinky", 17, 0.6],
  ];
  for (const [name, base, x] of columns) {
    pts[base] = { x, y: 0.6 }; // основание
    pts[base + 1] = { x, y: 0.5 }; // средний сустав
    pts[base + 2] = { x, y: f[name] ? 0.42 : 0.55 };
    pts[base + 3] = { x, y: f[name] ? 0.35 : 0.58 }; // кончик
  }
  tweak(pts);
  return pts;
}

describe("жесты в звонке: распознавание по точкам руки", () => {
  it("состояния пальцев", () => {
    expect(fingerStates(hand({ thumb: true, middle: true }))).toEqual([true, false, true, false, false]);
  });

  it("👍 — только большой палец", () => {
    expect(recognizeGesture(hand({ thumb: true }))).toBe("thumbs_up");
  });

  it("❤️ — большой и указательный сведены кончиками", () => {
    const heart = hand({ thumb: true, index: true }, (p) => (p[4] = { x: 0.3, y: 0.38 }, p[8] = { x: 0.33, y: 0.35 }));
    expect(recognizeGesture(heart)).toBe("heart");
    // Разведены — не сердце.
    expect(recognizeGesture(hand({ thumb: true, index: true }))).toBeNull();
  });

  it("✌️ — указательный и средний", () => {
    expect(recognizeGesture(hand({ index: true, middle: true }))).toBe("peace");
  });

  it("👏 — открытая ладонь", () => {
    expect(recognizeGesture(hand({ thumb: true, index: true, middle: true, ring: true, pinky: true }))).toBe("clap");
  });

  it("👌 — колечко из большого и указательного, остальные разогнуты", () => {
    const ok = hand({ middle: true, ring: true, pinky: true }, (p) => (p[8] = { x: 0.43, y: 0.66 }));
    expect(recognizeGesture(ok)).toBe("ok");
  });

  it("🤘 — указательный и мизинец", () => {
    expect(recognizeGesture(hand({ index: true, pinky: true }))).toBe("rock");
  });

  it("кулак и неполная рука — ничего", () => {
    expect(recognizeGesture(hand({}))).toBeNull();
    expect(recognizeGesture(hand({}).slice(0, 10))).toBeNull();
  });

  it("подписи на экране", () => {
    expect(Object.values(GESTURES).map((g) => `${g.emoji} ${g.label}`)).toEqual(["👍 Лайк", "❤️ Сердце", "✌️ Мир", "👏 Хлопок", "👌 Ок", "🤘 Рок"]);
  });

  it("не чаще раза в 3 с и не тот же жест подряд, пока рука не ушла из кадра", () => {
    const gate = new GestureGate(3000);
    expect(gate.accept("thumbs_up", 10_000)).toBe(true);
    expect(gate.accept("peace", 11_000)).toBe(false);
    expect(gate.accept("thumbs_up", 14_000)).toBe(false);
    expect(gate.accept("peace", 14_000)).toBe(true);
    gate.reset();
    expect(gate.accept("peace", 17_500)).toBe(true);
    expect(gate.accept(null, 30_000)).toBe(false);
  });
});
