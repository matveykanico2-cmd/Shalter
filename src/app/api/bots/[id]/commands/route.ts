import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { all, get, run, now } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };
function owned(id: number, userId: number) { if (!get("SELECT id FROM bots WHERE id = ? AND owner_id = ?", id, userId)) throw new HttpError(404, "Bot not found."); }
export const GET = route(async (_req, { params }: Ctx) => { const me = await requireUser(); const id = intParam((await params).id); owned(id, me.id); return { commands: all<{ id: number; command: string; response: string }>("SELECT id, command, response FROM bot_commands WHERE bot_id = ? ORDER BY command", id) }; });
export const POST = route(async (req, { params }: Ctx) => { const me = await requireUser(); const id = intParam((await params).id); owned(id, me.id); const body = await jsonBody<{ command?: string; response?: string }>(req); const command = String(body.command ?? "").trim().toLowerCase(); const response = String(body.response ?? "").trim(); if (!/^\/[a-z0-9_-]{1,32}$/.test(command) || !response) throw new HttpError(400, "Use a command like /help and add a response."); run("INSERT INTO bot_commands (bot_id, command, response, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(bot_id, command) DO UPDATE SET response = excluded.response", id, command, response.slice(0, 2000), now()); return { ok: true }; });
