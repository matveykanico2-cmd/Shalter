"use client";

import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/lib/client";
import type { StoryGroup } from "@/lib/types";
import { StoryViewer } from "@/components/story-viewer";
import { Spinner } from "@/components/ui";

export default function StoriesPage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { data, error, reload } = useApi<{ groups: StoryGroup[] }>(`/api/stories?include=${encodeURIComponent(username)}`);

  if (error) return <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-[#1a1a1a] px-6 text-center text-white"><p>Истории не загрузились.</p><p className="text-sm text-white/60">{error}</p><button type="button" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black" onClick={reload}>Повторить</button><button type="button" className="text-sm font-semibold text-link" onClick={() => router.push("/")}>На главную</button></div>;

  if (!data)
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1a1a1a]">
        <Spinner />
      </div>
    );

  const start = data.groups.findIndex((g) => g.user.username.toLowerCase() === decodeURIComponent(username).toLowerCase());
  if (start < 0) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[#1a1a1a] text-white">
        <p>This story is no longer available.</p>
        <button className="font-semibold text-link" onClick={() => router.push("/")}>
          Go home
        </button>
      </div>
    );
  }
  return <StoryViewer groups={data.groups} start={start} />;
}
