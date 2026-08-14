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

// The palette is fetched from the server (GET /api/chats/:id/features) rather
// than mirrored here: it's a list of colours with levels, only the edit dialog
// needs it, and a hand-kept copy of a table nobody reads twice is how the two
// drift apart. The thresholds above stay mirrored because the info panel shows
// the level badge on every render.
