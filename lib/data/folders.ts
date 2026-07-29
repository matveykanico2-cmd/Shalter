import { readCollection, updateCollection } from "./store";
import type { Folder } from "../types";

const FILE = "folders";

export async function listAllFolders(): Promise<Folder[]> {
  return readCollection<Folder>(FILE);
}

export async function listFoldersFor(ownerId: string): Promise<Folder[]> {
  const folders = await listAllFolders();
  return folders.filter((f) => f.ownerId === ownerId).sort((a, b) => a.order - b.order);
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const folders = await listAllFolders();
  return folders.find((f) => f.id === id);
}

export async function createFolder(folder: Folder): Promise<Folder> {
  await updateCollection<Folder>(FILE, (folders) => [...folders, folder]);
  return folder;
}

export async function updateFolder(id: string, patch: Partial<Folder>): Promise<Folder | undefined> {
  let updated: Folder | undefined;
  await updateCollection<Folder>(FILE, (folders) =>
    folders.map((f) => {
      if (f.id !== id) return f;
      updated = { ...f, ...patch };
      return updated;
    })
  );
  return updated;
}

export async function deleteFolder(id: string): Promise<void> {
  await updateCollection<Folder>(FILE, (folders) => folders.filter((f) => f.id !== id));
}
