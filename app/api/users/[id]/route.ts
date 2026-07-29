import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { updateUser, getUser } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";
import type { User } from "@/lib/types";

// Only profile fields may be edited this way — never credentials
// (passwordHash/passwordSalt/email/id), even for your own account.
const EDITABLE_FIELDS = ["name", "username", "bio", "avatarColor", "avatarImage"] as const;

export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  if (id !== uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json()) as Partial<User>;
  const patch: Partial<User> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }

  const user = await updateUser(id, patch);
  return NextResponse.json({ user: user ? publicUser(user) : null });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const user = await getUser(id);
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ user: publicUser(user) });
}
