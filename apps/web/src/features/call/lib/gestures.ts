// Жесты в видеозвонке — классификатор из main2 (public/js/lib/gestureDetector.js) по 21 точке
// руки MediaPipe Hands: пальцы разогнуты или согнуты, а дальше — по таблице жестов.

export type HandPoint = { x: number; y: number; z?: number };

export type GestureId = "thumbs_up" | "heart" | "peace" | "clap" | "ok" | "rock";

/** Что показываем на экране: большое эмодзи и подпись. */
export const GESTURES: Record<GestureId, { emoji: string; label: string }> = {
  thumbs_up: { emoji: "👍", label: "Лайк" },
  heart: { emoji: "❤️", label: "Сердце" },
  peace: { emoji: "✌️", label: "Мир" },
  clap: { emoji: "👏", label: "Хлопок" },
  ok: { emoji: "👌", label: "Ок" },
  rock: { emoji: "🤘", label: "Рок" },
};

// Точки MediaPipe: большой 1–4, указательный 5–8, средний 9–12, безымянный 13–16, мизинец 17–20.
const TIPS = [4, 8, 12, 16, 20];
const PIPS = [3, 6, 10, 14, 18];
const MCPS = [2, 5, 9, 13, 17];

/** Разогнут ли палец: [большой, указательный, средний, безымянный, мизинец]. */
export function fingerStates(hand: readonly HandPoint[]): boolean[] {
  return TIPS.map((tipIdx, i) => {
    const tip = hand[tipIdx]!;
    const pip = hand[PIPS[i]!]!;
    const mcp = hand[MCPS[i]!]!;
    // Большой палец отходит вбок — сравниваем по x, остальные — по y (кончик выше сустава).
    return i === 0 ? Math.abs(tip.x - mcp.x) > Math.abs(pip.x - mcp.x) * 0.5 : tip.y < pip.y - 0.02;
  });
}

const dist = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Жест одной руки или null. */
export function recognizeGesture(hand: readonly HandPoint[]): GestureId | null {
  if (hand.length < 21) return null;
  const [thumb, index, middle, ring, pinky] = fingerStates(hand);
  const pinch = dist(hand[4]!, hand[8]!);
  if (thumb && !index && !middle && !ring && !pinky) return "thumbs_up";
  // Сердце: кончики большого и указательного сведены, остальные согнуты.
  if (thumb && index && !middle && !ring && !pinky && pinch < 0.08) return "heart";
  if (!thumb && index && middle && !ring && !pinky) return "peace";
  // Открытая ладонь — «хлопок».
  if (thumb && index && middle && ring && pinky) return "clap";
  // Ок: колечко из большого и указательного, остальные разогнуты.
  if (!thumb && !index && middle && ring && pinky && pinch < 0.06) return "ok";
  if (!thumb && index && !middle && !ring && pinky) return "rock";
  return null;
}

/**
 * Не чаще раза в cooldownMs и не тот же жест подряд (пока рука не пропала из кадра) —
 * как lastGesture/gestureCooldown в main2.
 */
export class GestureGate {
  private last: GestureId | null = null;
  private lastAt = -Infinity;

  public constructor(private readonly cooldownMs = 3000) {}

  /** Рук в кадре нет — тот же жест снова засчитается. */
  public reset() {
    this.last = null;
  }

  public accept(gesture: GestureId | null, now: number) {
    if (!gesture || gesture === this.last || now - this.lastAt <= this.cooldownMs) return false;
    this.last = gesture;
    this.lastAt = now;
    return true;
  }
}
