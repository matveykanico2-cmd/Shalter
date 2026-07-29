import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getFolder, updateFolder, deleteFolder } from "@/lib/data/folders";

export async function PATCH(request: Request, ctx: RouteContext<"/api/folders/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const existing = await getFolder(id);
  if (!existing || existing.ownerId !== uid) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const patch = await request.json();
  const folder = await updateFolder(id, patch);
  return NextResponse.json({ folder });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/folders/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const existing = await getFolder(id);
  if (!existing || existing.ownerId !== uid) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteFolder(id);
  return NextResponse.json({ ok: true });
}
