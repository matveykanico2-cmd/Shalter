import { route, intParam, jsonBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { updateCall } from "@/lib/server/dm";

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const body = await jsonBody<{ offer?: string; answer?: string; ice?: string; status?: "active" | "ended" }>(req);
  updateCall(intParam((await params).id), me.id, body);
});
