import { route, intParam, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { saveUpload } from "@/lib/server/media";
import { loadMessages, otherMember, sendMediaMessage } from "@/lib/server/dm";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  otherMember(id, me.id);
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a photo or video.");
  const media = await saveUpload(file);
  const messageId = sendMediaMessage(id, me.id, media);
  return { message: loadMessages(id, messageId - 1, me.id).find((m) => m.id === messageId) };
});
