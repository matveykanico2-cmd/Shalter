import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { updateCall } from "@/lib/data/calls";

export async function PATCH(request: Request, ctx: RouteContext<"/api/calls/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const patch = await request.json();
  const call = await updateCall(id, patch);
  return NextResponse.json({ call });
}
