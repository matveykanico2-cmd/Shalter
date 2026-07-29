import { NextResponse } from "next/server";
import { getCurrentUserId, removeAccountSession } from "@/lib/auth";

// Body is optional: {} logs out the active account only, leaving any other
// accounts open on this browser signed in (mirrors Telegram's per-account logout).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as { uid?: string });
  const uid = body.uid ?? (await getCurrentUserId());
  if (!uid) return NextResponse.json({ ok: true, remaining: [] });
  const remaining = await removeAccountSession(uid);
  return NextResponse.json({ ok: true, remaining });
}
