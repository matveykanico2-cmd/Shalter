import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getCall } from "@/lib/data/calls";
import { addSignal, listSignalsFor } from "@/lib/data/signals";

export async function GET(request: Request, ctx: RouteContext<"/api/calls/[id]/signal">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const call = await getCall(id);
  if (!call || !call.participantIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
  const signals = await listSignalsFor(id, uid, Number.isFinite(after) ? after : 0);
  return NextResponse.json({ signals });
}

export async function POST(request: Request, ctx: RouteContext<"/api/calls/[id]/signal">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const call = await getCall(id);
  if (!call || !call.participantIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { toUserId, kind, data } = (await request.json()) as {
    toUserId: string;
    kind: "offer" | "answer" | "ice" | "end";
    data: unknown;
  };
  if (!call.participantIds.includes(toUserId)) {
    return NextResponse.json({ error: "invalid recipient" }, { status: 400 });
  }
  const signal = await addSignal({ callId: id, fromUserId: uid, toUserId, kind, data });
  return NextResponse.json({ signal });
}
