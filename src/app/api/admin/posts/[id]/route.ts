import { route, intParam, HttpError } from "@/lib/server/http";
import { all, get, run } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/admin";
import { deleteUpload } from "@/lib/server/media";

export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const id = intParam((await params).id);
  if (!get("SELECT 1 FROM posts WHERE id = ?", id)) throw new HttpError(404, "Post not found.");
  const media = all<{ url: string }>("SELECT url FROM post_media WHERE post_id = ?", id);
  run("DELETE FROM posts WHERE id = ?", id);
  for (const item of media) await deleteUpload(item.url);
});
