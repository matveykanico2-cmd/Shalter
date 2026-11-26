import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { votePoll } from "@/lib/server/dm";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const option = Number((await jsonBody<{ option?: number }>(req)).option);
  if (!Number.isInteger(option)) throw new HttpError(400, "Choose a poll option.");
  return votePoll(intParam((await params).id), me.id, option);
});
