// Kept in sync by hand with server/lib/groupLevels.js (no shared module
// system between server/client here) — see that file for what this means.
const LEVEL_THRESHOLDS = [10, 50, 200, 500, 1500, 5000];

export function levelForPoints(points) {
  return LEVEL_THRESHOLDS.filter((t) => (points ?? 0) >= t).length;
}

export function pointsToNextLevel(points) {
  const next = LEVEL_THRESHOLDS.find((t) => (points ?? 0) < t);
  return next === undefined ? null : next - (points ?? 0);
}
