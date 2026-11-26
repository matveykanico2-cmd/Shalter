import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { editMessage, unsendMessage } from "@/lib/server/dm";

// Unsend a direct message: only its sender can remove it, and it disappears for both people.
export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  unsendMessage(intParam((await params).id), me.id);
});

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const text = String((await jsonBody<{ text?: string }>(req)).text ?? "").trim().slice(0, 1000);
  if (!text) throw new HttpError(400, "Write a message first.");
  editMessage(intParam((await params).id), me.id, text);
});
