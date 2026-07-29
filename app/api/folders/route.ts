import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { listFoldersFor, createFolder } from "@/lib/data/folders";
import type { Folder } from "@/lib/types";

export async function GET() {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const folders = await listFoldersFor(uid);
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { name, chatIds } = (await request.json()) as { name: string; chatIds: string[] };
  const folders = await listFoldersFor(uid);
  const folder = await createFolder({
    id: `f_${Date.now()}`,
    ownerId: uid,
    name,
    chatIds: chatIds ?? [],
    order: folders.length,
  } satisfies Folder);
  return NextResponse.json({ folder });
}
