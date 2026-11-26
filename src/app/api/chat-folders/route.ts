import { route, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, now, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

type Folder = { id: number; name: string; position: number; conversationIds: number[] };

function folders(userId: number): Folder[] {
  const rows = all<{ id: number; name: string; position: number; conversation_id: number | null }>(
    `SELECT f.id, f.name, f.position, i.conversation_id
     FROM chat_folders f LEFT JOIN chat_folder_items i ON i.folder_id = f.id AND i.user_id = f.user_id
     WHERE f.user_id = ? ORDER BY f.position, f.id`,
    userId,
  );
  return rows.reduce<Folder[]>((result, row) => {
    let folder = result.find((item) => item.id === row.id);
    if (!folder) { folder = { id: row.id, name: row.name, position: row.position, conversationIds: [] }; result.push(folder); }
    if (row.conversation_id !== null) folder.conversationIds.push(row.conversation_id);
    return result;
  }, []);
}

export const GET = route(async () => ({ folders: folders((await requireUser()).id) }));

export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await jsonBody<{ action?: "create" | "rename" | "delete" | "add" | "remove"; name?: string; folderId?: number; conversationId?: number }>(req);
  const action = body.action ?? "create";
  if (action === "create") {
    const name = String(body.name ?? "").trim().slice(0, 32);
    if (!name) throw new HttpError(400, "Folder name is required.");
    if (get("SELECT 1 FROM chat_folders WHERE user_id = ? AND name = ?", me.id, name)) throw new HttpError(409, "This folder already exists.");
    const position = get<{ n: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM chat_folders WHERE user_id = ?", me.id)!.n;
    run("INSERT INTO chat_folders (user_id, name, position, created_at) VALUES (?, ?, ?, ?)", me.id, name, position, now());
  } else {
    const folderId = Number(body.folderId);
    const conversationId = Number(body.conversationId);
    if (!Number.isInteger(folderId)) throw new HttpError(400, "Invalid folder.");
    if (!get("SELECT 1 FROM chat_folders WHERE id = ? AND user_id = ?", folderId, me.id)) throw new HttpError(404, "Folder not found.");
    if (action === "rename") {
      const name = String(body.name ?? "").trim().slice(0, 32);
      if (!name) throw new HttpError(400, "Folder name is required.");
      run("UPDATE chat_folders SET name = ? WHERE id = ? AND user_id = ?", name, folderId, me.id);
    } else if (action === "delete") run("DELETE FROM chat_folders WHERE id = ? AND user_id = ?", folderId, me.id);
    else {
      if (!Number.isInteger(conversationId)) throw new HttpError(400, "Invalid conversation.");
      if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, me.id)) throw new HttpError(403, "You are not a member of this conversation.");
      if (action === "add") run("INSERT OR IGNORE INTO chat_folder_items (folder_id, user_id, conversation_id, created_at) VALUES (?, ?, ?, ?)", folderId, me.id, conversationId, now());
      else if (action === "remove") run("DELETE FROM chat_folder_items WHERE folder_id = ? AND user_id = ? AND conversation_id = ?", folderId, me.id, conversationId);
      else throw new HttpError(400, "Unknown folder action.");
    }
  }
  return { folders: folders(me.id) };
});
