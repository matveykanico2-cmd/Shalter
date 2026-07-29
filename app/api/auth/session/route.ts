import { NextResponse } from "next/server";
import { getCurrentUserId, getSessionUserIds } from "@/lib/auth";
import { getUser } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";

export async function GET() {
  const uid = await getCurrentUserId();
  const ids = await getSessionUserIds();
  const accountUsers = (await Promise.all(ids.map((id) => getUser(id)))).filter((u) => u !== undefined);

  if (!uid) return NextResponse.json({ user: null, accounts: [] });
  const user = await getUser(uid);
  return NextResponse.json({
    user: user ? publicUser(user) : null,
    accounts: accountUsers.map(publicUser),
  });
}
