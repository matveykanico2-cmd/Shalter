import { NextResponse } from "next/server";
import { findOrCreateUserByPhone } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";
import { addAccountSession } from "@/lib/auth";
import type { User } from "@/lib/types";

// Mock: any 4+ digit code is accepted (demo code is "00000").
export async function POST(request: Request) {
  const { phone, code } = (await request.json()) as { phone: string; code: string };
  if (!code || code.replace(/\D/g, "").length < 4) {
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }

  const { user, isNew } = await findOrCreateUserByPhone(phone, () => ({
    id: `u_${Date.now()}`,
    name: "",
    username: "",
    phone,
    avatarColor: "#2E56D9",
    bio: "",
    online: true,
    lastSeen: new Date().toISOString(),
  } satisfies User));

  await addAccountSession(user.id);
  return NextResponse.json({ user: publicUser(user), isNew });
}
