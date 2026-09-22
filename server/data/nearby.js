const db = require("../db");

// «Люди рядом» — намеренно неточно, на каждом шаге:
//   1. Координаты округляются здесь, на сервере, а не там, где их прислал
//      браузер — округление на клиенте ничего не мешает обойти. 0.01° — это
//      около 1.1 км по широте, то есть "координата" — это ячейка сетки
//      километр на километр, а не точка.
//   2. Другим отдаётся не расстояние в метрах, а один из пяти диапазонов
//      (см. bucketFor) — точное число, повторённое с трёх точек обзора,
//      превращается в триангуляцию; диапазон — нет.
//   3. Присутствие само гаснет через полчаса без обновления (фильтр при
//      чтении, без отдельного job — тот же приём, что и у историй).
const GRID = 0.01;
const PRESENCE_TTL_MS = 30 * 60 * 1000;

function roundCoord(v) {
  return Math.round(v / GRID) * GRID;
}

async function setNearbyLocation(userId, lat, lng) {
  db.prepare("UPDATE users SET nearbyLat = ?, nearbyLng = ?, nearbyUpdatedAt = ? WHERE id = ?").run(
    roundCoord(lat),
    roundCoord(lng),
    new Date().toISOString(),
    userId
  );
}

async function clearNearbyLocation(userId) {
  db.prepare("UPDATE users SET nearbyLat = NULL, nearbyLng = NULL, nearbyUpdatedAt = NULL WHERE id = ?").run(userId);
}

// Хаверсин по уже округлённым координатам — точность тут и не нужна, есть
// только у той сетки, что и была сохранена.
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const BUCKETS = [
  { max: 1, label: "менее 1 км" },
  { max: 3, label: "1–3 км" },
  { max: 10, label: "3–10 км" },
  { max: 30, label: "10–30 км" },
  { max: Infinity, label: "более 30 км" },
];

function bucketFor(km) {
  const b = BUCKETS.find((b) => km < b.max);
  return { label: b.label, order: BUCKETS.indexOf(b) };
}

async function listNearbyUsers(viewerId, viewerLat, viewerLng, viewerBlockedIds = []) {
  const vLat = roundCoord(viewerLat);
  const vLng = roundCoord(viewerLng);
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  const viewerBlocked = new Set(viewerBlockedIds);

  const rows = db
    .prepare(
      `SELECT id, name, username, avatarColor, avatarImage, nearbyLat, nearbyLng, blockedUserIds
       FROM users
       WHERE nearbyLat IS NOT NULL AND nearbyLng IS NOT NULL AND nearbyUpdatedAt > ?`
    )
    .all(cutoff)
    .filter((r) => {
      if (r.id === viewerId || viewerBlocked.has(r.id)) return false;
      // Заблокировал меня — значит, и его самого мне тоже не видно.
      const theirBlocked = JSON.parse(r.blockedUserIds || "[]");
      return !theirBlocked.includes(viewerId);
    });

  const withDistance = rows.map((r) => {
    const km = distanceKm(vLat, vLng, r.nearbyLat, r.nearbyLng);
    const bucket = bucketFor(km);
    return { id: r.id, name: r.name, username: r.username, avatarColor: r.avatarColor, avatarImage: r.avatarImage, ...bucket };
  });

  // В пределах одного диапазона — вперемешку, не по точному расстоянию: иначе
  // порядок сам по себе выдавал бы то, что диапазон нарочно скрывает.
  for (let i = withDistance.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [withDistance[i], withDistance[j]] = [withDistance[j], withDistance[i]];
  }
  withDistance.sort((a, b) => a.order - b.order);
  return withDistance.map(({ order, ...rest }) => rest);
}

module.exports = { setNearbyLocation, clearNearbyLocation, listNearbyUsers };
