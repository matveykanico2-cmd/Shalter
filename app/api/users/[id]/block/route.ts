import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { setBlocked } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";

export async function POST(request: Request, ctx: RouteContext<"/api/users/[id]/block">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const { blocked } = (await request.json()) as { blocked: boolean };
  const user = await setBlocked(uid, id, blocked);
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
