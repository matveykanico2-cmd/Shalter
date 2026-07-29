import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listSessions } from "@/lib/data/sessions";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const sessions = await listSessions(uid);
  return NextResponse.json({ sessions });
}
