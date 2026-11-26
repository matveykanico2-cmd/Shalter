"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api, useApi, useIsPhone, useOnCreated } from "@/lib/client";
import type { StoryGroup } from "@/lib/types";
import { useApp } from "./app-context";
import { Avatar, Spinner } from "./ui";

export function StoriesBar() {
  const { me, toast } = useApp();
  const { data, error, reload } = useApi<{ groups: StoryGroup[] }>("/api/stories");
  const scroller = useRef<HTMLDivElement>(null);
  // The Instagram app shows bigger story circles on phones.
  const ringSize = useIsPhone() ? 80 : 62;
  const [uploading, setUploading] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: true });
  useOnCreated(useCallback(() => reload(), [reload]));

  const mine = data?.groups.find((g) => g.user.id === me.id);
  const others = data?.groups.filter((g) => g.user.id !== me.id) ?? [];

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api("/api/stories", { body: form });
      toast("Your story has been shared.");
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  // Items without a link open the story file picker (via the label).
  const item = (key: string | number, avatar: React.ReactNode, name: string, href?: string) => {
    const content = (
      <>
        {avatar}
        <span className="w-[74px] truncate text-center text-xs max-md:w-[92px] max-md:text-[13px]">{name}</span>
      </>
    );
    return href ? (
      <Link key={key} href={href} className="flex shrink-0 flex-col items-center gap-1">
        {content}
      </Link>
    ) : (
      <label key={key} htmlFor="story-upload" className="flex shrink-0 cursor-pointer flex-col items-center gap-1">
        {content}
      </label>
    );
  };

  return (
    <div className="relative mb-2 md:mb-6 md:mt-2 md:border-0">
      {error && <div className="mx-3 mb-2 flex items-center justify-between rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"><span>Истории не загрузились</span><button type="button" onClick={reload} className="font-bold">Повторить</button></div>}
      <div
        ref={scroller}
        className="no-scrollbar flex gap-3 overflow-x-auto px-3 py-2.5 max-md:gap-2.5 max-md:pb-3 md:px-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          setEdges({ left: el.scrollLeft > 5, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 5 });
        }}
      >
        {item(
          "me",
          <span className="relative">
            {uploading ? (
              <span className="flex h-[70px] w-[70px] items-center justify-center">
                <Spinner />
              </span>
            ) : (
              <Avatar src={me.avatar} size={ringSize} ring={mine ? (mine.allSeen ? "seen" : "unseen") : null} />
            )}
            {!mine && !uploading && (
              <span className="absolute bottom-0 right-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-bg bg-link text-white max-md:h-7 max-md:w-7 max-md:border-[3px] max-md:bg-white max-md:text-black">
                <Plus size={14} strokeWidth={3} />
              </span>
            )}
          </span>,
          "Your story",
          mine ? `/stories/${me.username}` : undefined,
        )}
        {others.map((g) =>
          item(
            g.user.id,
            <Avatar src={g.user.avatar} size={ringSize} ring={g.allSeen ? "seen" : "unseen"} />,
            g.user.username,
            `/stories/${g.user.username}`,
          ),
        )}
        {!data &&
          Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="flex shrink-0 flex-col items-center gap-1">
              <span className="h-[66px] w-[66px] rounded-full bg-secondary" />
              <span className="h-2.5 w-14 rounded bg-secondary" />
            </span>
          ))}
      </div>
      <input
        id="story-upload"
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {edges.left && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-2 top-8 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow md:flex"
          aria-label="Previous"
        >
          <ChevronLeft size={16} strokeWidth={3} />
        </button>
      )}
      {edges.right && others.length > 6 && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-2 top-8 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow md:flex"
          aria-label="Next"
        >
          <ChevronRight size={16} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
