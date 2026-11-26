import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { get, run } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const body = await jsonBody<{ active?: boolean; description?: string }>(req);
  if (!get("SELECT id FROM bots WHERE id = ? AND owner_id = ?", id, me.id)) throw new HttpError(404, "Bot not found.");
  run("UPDATE bots SET active = COALESCE(?, active), description = COALESCE(?, description) WHERE id = ?", body.active === undefined ? null : body.active ? 1 : 0, body.description === undefined ? null : String(body.description).slice(0, 300), id);
  return { ok: true };
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  if (!get("SELECT id FROM bots WHERE id = ? AND owner_id = ?", id, me.id)) throw new HttpError(404, "Bot not found.");
  run("DELETE FROM bots WHERE id = ?", id);
  return { ok: true };
});
