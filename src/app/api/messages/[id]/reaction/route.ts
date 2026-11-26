import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { toggleReaction } from "@/lib/server/dm";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const emoji = String((await jsonBody<{ emoji?: string }>(req)).emoji ?? "").trim();
  if (!/^\p{Extended_Pictographic}$/u.test(emoji)) throw new HttpError(400, "Choose one emoji.");
  return { reacted: toggleReaction(intParam((await params).id), me.id, emoji) };
});
