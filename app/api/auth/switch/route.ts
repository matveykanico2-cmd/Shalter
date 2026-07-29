import { NextResponse } from "next/server";
import { getSessionUserIds, switchActiveAccount } from "@/lib/auth";
import { getUser } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";

export async function POST(request: Request) {
  const { userId } = (await request.json()) as { userId: string };
  const ids = await getSessionUserIds();
  if (!ids.includes(userId)) {
    return NextResponse.json({ error: "Этот аккаунт не подключён на этом устройстве" }, { status: 403 });
  }
  await switchActiveAccount(userId);
  const user = await getUser(userId);
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
