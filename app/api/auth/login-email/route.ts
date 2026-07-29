import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";
import { addAccountSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email: string; password: string };
  const user = await findUserByEmail(email ?? "");

  // Same generic error whether the email or the password was wrong —
  // don't tell an attacker which part of the guess was right.
  if (!user || !user.passwordHash || !user.passwordSalt || !verifyPassword(password ?? "", user.passwordHash, user.passwordSalt)) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  await addAccountSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
