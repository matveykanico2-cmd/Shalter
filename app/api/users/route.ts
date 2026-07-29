import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listUsers } from "@/lib/data/users";
import { publicUsers } from "@/lib/data/sanitize";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const users = await listUsers();
  return NextResponse.json({ users: publicUsers(users.filter((u) => u.id !== uid)) });
}
