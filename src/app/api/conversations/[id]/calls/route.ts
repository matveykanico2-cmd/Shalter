import { route, intParam, jsonBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { createCall, readCall } from "@/lib/server/dm";

export const GET = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const callId = Number(new URL(req.url).searchParams.get("call")) || undefined;
  return { call: readCall(id, me.id, callId) ?? null };
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  const kind = (await jsonBody<{ kind?: "audio" | "video" }>(req)).kind;
  return { callId: createCall(id, me.id, kind === "video" ? "video" : "audio") };
});
