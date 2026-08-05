// Group "points" (server/routes/chats.js's /:id/vote) — Premium members can
// cast one vote per 24h to add a point; crossing a threshold here levels the
// group up. Levels are purely cosmetic (a badge — see public/js/lib/
// groupLevels.js, kept in sync with this file by hand since server/client
// don't share a module system here) rather than gating any real feature,
// since there's nothing else in this app worth rationing behind a score.
const LEVEL_THRESHOLDS = [10, 50, 200, 500, 1500, 5000];

function levelForPoints(points) {
  return LEVEL_THRESHOLDS.filter((t) => points >= t).length;
}

module.exports = { LEVEL_THRESHOLDS, levelForPoints };
