import type { SelfUser } from "@/entities/session";
import { useStoryViewerRequest } from "@/entities/story";

import { StoryViewer } from "./story-viewer";

/** Просмотр историй поверх приложения; открывают его openStoryViewer (полоса историй, профиль). */
export function StoryViewerHost({ me }: { me: SelfUser }) {
  const request = useStoryViewerRequest();
  return request ? <StoryViewer key={request.id} request={request} me={me} /> : null;
}
