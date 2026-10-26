import { openDm } from "@/entities/chat";
import type { StoryAuthor } from "@/entities/story";

import { http } from "@/shared/api";

/** Ответ на историю уходит автору в личку с плашкой «Ответ на историю» (sendReply в storyViewer.js). */
export async function sendStoryReply(author: StoryAuthor, text: string, media: { url: string; kind: "image" | "video" }) {
  const { chat } = await openDm(author.id, author.name ?? "", author.avatarColor);
  await http.post<unknown>(`/api/chats/${encodeURIComponent(chat.id)}/messages`, {
    text,
    storyReply: { url: media.url, kind: media.kind, authorName: author.name },
  });
}
