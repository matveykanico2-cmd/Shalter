import { NextResponse } from "next/server";
import { createUser, findUserByEmail } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";
import { addAccountSession } from "@/lib/auth";
import { hashPassword } from "@/lib/security";
import type { User } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { name, email, password } = (await request.json()) as {
    name: string;
    email: string;
    password: string;
  };

  if (!name?.trim()) return NextResponse.json({ error: "Введите имя" }, { status: 400 });
  if (!EMAIL_RE.test(email ?? "")) return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Пароль должен быть не короче 6 символов" }, { status: 400 });
  }
  if (await findUserByEmail(email)) {
    return NextResponse.json({ error: "Аккаунт с таким email уже существует" }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const user = await createUser({
    id: `u_${Date.now()}`,
    name: name.trim(),
    username: name.trim().toLowerCase().replace(/\s+/g, "_"),
    phone: "",
    email: email.trim().toLowerCase(),
    passwordHash: hash,
    passwordSalt: salt,
    avatarColor: "#2E56D9",
    bio: "",
    online: true,
    lastSeen: new Date().toISOString(),
  } satisfies User);

  await addAccountSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
