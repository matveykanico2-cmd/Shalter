import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listBots } from "@/lib/data/bots";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const bots = await listBots();
  return NextResponse.json({ bots });
}
