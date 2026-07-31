const db = require("../db");

function rowToFolder(row) {
  if (!row) return undefined;
  return { id: row.id, ownerId: row.ownerId, name: row.name, order: row.sortOrder, chatIds: JSON.parse(row.chatIds) };
}

function listAllFolders() {
  return db.prepare("SELECT * FROM folders").all().map(rowToFolder);
}

async function listFoldersFor(ownerId) {
  return db.prepare("SELECT * FROM folders WHERE ownerId = ? ORDER BY sortOrder ASC").all(ownerId).map(rowToFolder);
}

async function getFolder(id) {
  return rowToFolder(db.prepare("SELECT * FROM folders WHERE id = ?").get(id));
}

async function createFolder(folder) {
  db.prepare("INSERT INTO folders (id, ownerId, name, sortOrder, chatIds) VALUES (?, ?, ?, ?, ?)").run(
    folder.id,
    folder.ownerId,
    folder.name,
    folder.order ?? 0,
    JSON.stringify(folder.chatIds ?? [])
  );
  return getFolder(folder.id);
}

async function updateFolder(id, patch) {
  const existing = db.prepare("SELECT id FROM folders WHERE id = ?").get(id);
  if (!existing) return undefined;
  if ("name" in patch) db.prepare("UPDATE folders SET name = ? WHERE id = ?").run(patch.name, id);
  if ("order" in patch) db.prepare("UPDATE folders SET sortOrder = ? WHERE id = ?").run(patch.order, id);
  if ("chatIds" in patch) db.prepare("UPDATE folders SET chatIds = ? WHERE id = ?").run(JSON.stringify(patch.chatIds ?? []), id);
  return getFolder(id);
}

async function deleteFolder(id) {
  db.prepare("DELETE FROM folders WHERE id = ?").run(id);
}

module.exports = { listAllFolders, listFoldersFor, getFolder, createFolder, updateFolder, deleteFolder };
