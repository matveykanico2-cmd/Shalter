// Уровни групп и каналов по бустам — как public/js/lib/groupLevels.js.
const LEVEL_THRESHOLDS = [10, 50, 200, 500, 1500, 5000];

export const levelForPoints = (points = 0) => LEVEL_THRESHOLDS.filter((t) => points >= t).length;

/** Сколько бустов до следующего уровня; null — уровень максимальный. */
export function pointsToNextLevel(points = 0) {
  const next = LEVEL_THRESHOLDS.find((t) => points < t);
  return next === undefined ? null : next - points;
}

/** Порог текущего и следующего уровня — для полосы прогресса в окне буста. */
export function levelBounds(points = 0) {
  const level = levelForPoints(points);
  return { level, from: level === 0 ? 0 : (LEVEL_THRESHOLDS[level - 1] ?? 0), to: LEVEL_THRESHOLDS[level] ?? null };
}
