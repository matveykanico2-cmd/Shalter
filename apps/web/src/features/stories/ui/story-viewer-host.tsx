import { lazy, Suspense } from "react";

import type { SelfUser } from "@/entities/session";
import { useStoryViewerRequest } from "@/entities/story";

// Просмотрщик — отдельным чанком: на старте он не нужен.
const StoryViewer = lazy(() => import("./story-viewer").then((m) => ({ default: m.StoryViewer })));

/** Просмотр историй поверх приложения; открывают его openStoryViewer (полоса историй, профиль). */
export function StoryViewerHost({ me, onHashtag }: { me: SelfUser; onHashtag?: (tag: string) => void }) {
  const request = useStoryViewerRequest();
  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <StoryViewer key={request.id} request={request} me={me} onHashtag={onHashtag} />
    </Suspense>
  );
}
