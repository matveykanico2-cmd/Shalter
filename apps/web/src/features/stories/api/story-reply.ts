import { openDm } from "@/entities/chat";
import type { StoryAuthor } from "@/entities/story";

import { http } from "@/shared/api";

/** Ответ на историю уходит автору в личку с плашкой «Ответ на историю» (sendReply в storyViewer.js). */
export async function sendStoryReply(author: StoryAuthor, text: string, media: { url: string; kind: "image" | "video"; createdAt: string }) {
  const { chat } = await openDm(author.id, author.name ?? "", author.avatarColor);
  await http.post<unknown>(`/api/chats/${encodeURIComponent(chat.id)}/messages`, {
    text,
    // authorId и createdAt — чтобы из ответа история открывалась с аватаркой автора и
    // настоящим временем публикации, а не «только что».
    storyReply: { url: media.url, kind: media.kind, authorName: author.name, authorId: author.id, createdAt: media.createdAt },
  });
}
