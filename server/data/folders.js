const { readCollection, updateCollection } = require("./store");

const FILE = "folders";

function listAllFolders() {
  return readCollection(FILE);
}

async function listFoldersFor(ownerId) {
  const folders = await listAllFolders();
  return folders.filter((f) => f.ownerId === ownerId).sort((a, b) => a.order - b.order);
}

async function getFolder(id) {
  const folders = await listAllFolders();
  return folders.find((f) => f.id === id);
}

async function createFolder(folder) {
  await updateCollection(FILE, (folders) => [...folders, folder]);
  return folder;
}

async function updateFolder(id, patch) {
  let updated;
  await updateCollection(FILE, (folders) =>
    folders.map((f) => {
      if (f.id !== id) return f;
      updated = { ...f, ...patch };
      return updated;
    })
  );
  return updated;
}

async function deleteFolder(id) {
  await updateCollection(FILE, (folders) => folders.filter((f) => f.id !== id));
}

module.exports = { listAllFolders, listFoldersFor, getFolder, createFolder, updateFolder, deleteFolder };
