// Group "points" (server/routes/chats.js's /:id/vote) — Premium members can
// cast one vote per 24h to add a point; crossing a threshold here levels the
// group up. A level is no longer only a badge: each threshold unlocks another
// piece of the chat's customisation — see server/lib/chatFeatures.js for the
// table and for where each gate is actually enforced. The badge lives in
// public/js/lib/groupLevels.js, kept in sync with this file by hand since
// server and client don't share a module system here.
const LEVEL_THRESHOLDS = [10, 50, 200, 500, 1500, 5000];

function levelForPoints(points) {
  return LEVEL_THRESHOLDS.filter((t) => points >= t).length;
}

module.exports = { LEVEL_THRESHOLDS, levelForPoints };
