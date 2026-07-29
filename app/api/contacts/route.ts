import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listContactsFor, addContact, removeContact } from "@/lib/data/contacts";
import { listUsers } from "@/lib/data/users";
import { publicUser } from "@/lib/data/sanitize";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const [contacts, users] = await Promise.all([listContactsFor(uid), listUsers()]);
  const resolved = contacts
    .map((c) => {
      const user = users.find((u) => u.id === c.userId);
      return user ? { ...c, user: publicUser(user) } : null;
    })
    .filter((c) => c !== null);
  return NextResponse.json({ contacts: resolved });
}

export async function POST(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { userId } = (await request.json()) as { userId: string };
  const contact = await addContact({ id: `ct_${Date.now()}`, ownerId: uid, userId, addedAt: new Date().toISOString() });
  return NextResponse.json({ contact });
}

export async function DELETE(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { userId } = (await request.json()) as { userId: string };
  await removeContact(uid, userId);
  return NextResponse.json({ ok: true });
}
