import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getSettings, updateSettings } from "@/lib/data/settings";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const settings = await getSettings(uid);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const patch = await request.json();
  const settings = await updateSettings(uid, patch);
  return NextResponse.json({ settings });
}
