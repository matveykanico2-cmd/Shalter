import { route, intParam } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { togglePinMessage } from "@/lib/server/dm";

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  return { pinned: togglePinMessage(intParam((await params).id), me.id) };
});
