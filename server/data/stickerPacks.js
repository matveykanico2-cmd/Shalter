const db = require("../db");

// User-made sticker packs. The built-in set stays in the client
// (public/js/lib/stickers.js) — it ships with the app and never changes at
// runtime; these are the packs people assemble themselves.
//
// The stickers of a pack are a JSON column rather than their own table: they're
// only ever read and written as a whole pack, never queried across rows, which
// is exactly the rule AGENTS.md sets for when nesting stays JSON.

const MAX_STICKERS = 60;
const MAX_NAME = 40;

function rowToPack(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    stickers: JSON.parse(row.stickers ?? "[]"),
    createdAt: row.createdAt,
  };
}

// Trusted nowhere: a pack is user-authored content that ends up rendered in
// other people's chats, so the shape is pinned down here rather than wherever it
// happens to be displayed. `scene` names an animation in the client's own scene
// table (public/js/lib/animScenes.js) and is restricted to a plain identifier so
// it can't escape into the class attribute as anything else.
function sanitizeStickers(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const s of input.slice(0, MAX_STICKERS)) {
    const emoji = String(s?.emoji ?? "").trim().slice(0, 8);
    if (!emoji) continue;
    out.push({
      emoji,
      name: String(s?.name ?? "").trim().slice(0, 40),
      ...(typeof s?.scene === "string" && /^[a-z0-9_]{1,32}$/.test(s.scene) ? { scene: s.scene } : {}),
    });
  }
  return out;
}

function listPacksFor(ownerId) {
  return db.prepare("SELECT * FROM sticker_packs WHERE ownerId = ? ORDER BY createdAt ASC").all(ownerId).map(rowToPack);
}

function getPack(id) {
  return rowToPack(db.prepare("SELECT * FROM sticker_packs WHERE id = ?").get(id));
}

function createPack({ ownerId, name, stickers }) {
  const pack = {
    id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    name: String(name ?? "").trim().slice(0, MAX_NAME) || "Мой пак",
    stickers: JSON.stringify(sanitizeStickers(stickers)),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO sticker_packs (id, ownerId, name, stickers, createdAt)
     VALUES (@id, @ownerId, @name, @stickers, @createdAt)`
  ).run(pack);
  return getPack(pack.id);
}

function updatePack(id, ownerId, { name, stickers }) {
  const existing = db.prepare("SELECT * FROM sticker_packs WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!existing) return undefined;
  db.prepare("UPDATE sticker_packs SET name = ?, stickers = ? WHERE id = ?").run(
    name === undefined ? existing.name : String(name).trim().slice(0, MAX_NAME) || existing.name,
    stickers === undefined ? existing.stickers : JSON.stringify(sanitizeStickers(stickers)),
    id
  );
  return getPack(id);
}

function deletePack(id, ownerId) {
  const res = db.prepare("DELETE FROM sticker_packs WHERE id = ? AND ownerId = ?").run(id, ownerId);
  return res.changes > 0;
}

module.exports = { listPacksFor, getPack, createPack, updatePack, deletePack, sanitizeStickers, MAX_STICKERS };
