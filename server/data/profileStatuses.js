const db = require("../db");
const { validateImage } = require("../lib/profileStatus");

const MAX_NAME = 40;

// Каталог готовых статусов (таблица в server/db.js). Читается всеми — выбор
// идёт с этого же списка у каждого, — а меняется только администратором
// (server/routes/admin.js), точно как safety_labels.
function listCatalog() {
  return db.prepare("SELECT * FROM profile_statuses ORDER BY createdAt ASC").all();
}

function getCatalogItem(id) {
  return db.prepare("SELECT * FROM profile_statuses WHERE id = ?").get(id);
}

function createCatalogItem({ image, name }) {
  const { image: validImage, error } = validateImage(image);
  if (error) return { error };
  const row = {
    id: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    image: validImage,
    name: String(name ?? "").trim().slice(0, MAX_NAME),
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO profile_statuses (id, image, name, createdAt) VALUES (@id, @image, @name, @createdAt)").run(row);
  return { item: row };
}

// Wardrobe entries copy the image at pick time (see server/db.js's comment on
// statusItems), so removing a catalog item never has to touch users — there's
// nothing left pointing back at it.
function deleteCatalogItem(id) {
  db.prepare("DELETE FROM profile_statuses WHERE id = ?").run(id);
}

module.exports = { listCatalog, getCatalogItem, createCatalogItem, deleteCatalogItem };
