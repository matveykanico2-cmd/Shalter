import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { removeSession } from "@/lib/data/sessions";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  await removeSession(id);
  return NextResponse.json({ ok: true });
}
