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

// Mirror of server/lib/chatFeatures.js's table — kept by hand, same as the
// thresholds above, since server and client don't share a module system here.
// The server enforces these; this copy exists only so the info panel can show
// what a level has unlocked and what the next one adds.
export const CHAT_FEATURES = [
  { id: "avatar", level: 1, label: "Аватар чата" },
  { id: "description", level: 2, label: "Описание чата" },
  { id: "autoDelete", level: 3, label: "Автоудаление сообщений" },
  { id: "publicLink", level: 4, label: "Публичная ссылка @юзернейм" },
  { id: "moderators", level: 5, label: "Роль модератора" },
];

export function featuresFor(points) {
  const level = levelForPoints(points);
  return CHAT_FEATURES.map((f) => ({ ...f, unlocked: level >= f.level }));
}
