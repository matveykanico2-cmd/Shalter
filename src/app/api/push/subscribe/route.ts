import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get, run, now } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

type Subscription = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
export const POST = route(async (req) => { const me = await requireUser(); const body = await jsonBody<Subscription>(req); const endpoint = String(body.endpoint ?? ""); const p256dh = String(body.keys?.p256dh ?? ""); const auth = String(body.keys?.auth ?? ""); if (!endpoint || !p256dh || !auth) throw new HttpError(400, "Invalid push subscription."); const existing = get("SELECT id FROM push_subscriptions WHERE endpoint = ?", endpoint); if (existing) run("UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, updated_at = ? WHERE endpoint = ?", me.id, p256dh, auth, now(), endpoint); else run("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", me.id, endpoint, p256dh, auth, now(), now()); return { ok: true }; });
export const DELETE = route(async (req) => { const me = await requireUser(); const endpoint = new URL(req.url).searchParams.get("endpoint"); if (endpoint) run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", me.id, endpoint); else run("DELETE FROM push_subscriptions WHERE user_id = ?", me.id); return { ok: true }; });
