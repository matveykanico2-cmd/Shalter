import { route, intParam, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { saveVoiceUpload } from "@/lib/server/media";
import { loadMessages, otherMember, sendVoiceMessage } from "@/lib/server/dm";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const id = intParam((await params).id);
  otherMember(id, me.id);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Record a voice message first.");
  const seconds = Number(form.get("seconds")) || 1;
  const voice = await saveVoiceUpload(file);
  const messageId = sendVoiceMessage(id, me.id, { url: voice.url, seconds });
  return { message: loadMessages(id, messageId - 1, me.id).find((m) => m.id === messageId) };
});
