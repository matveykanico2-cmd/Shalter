"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Heart, MoreHorizontal, Pause, Play, Send, Volume2, VolumeX, X } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import type { StoryGroup } from "@/lib/types";
import { useApp } from "./app-context";
import { useMuted } from "./media";
import { Logo } from "./nav";
import { UserListModal } from "./social";
import { Avatar, OptionsMenu } from "./ui";

const IMAGE_MS = 5000;

/** Full-screen story player. With `highlight`, it plays that highlight and its menu deletes the highlight. */
export function StoryViewer({
  groups: initialGroups,
  start,
  highlight,
}: {
  groups: StoryGroup[];
  start: number;
  highlight?: { id: number; title: string };
}) {
  const [groups, setGroups] = useState(initialGroups);
  const viewed = useRef(new Set<number>());
  const router = useRouter();
  const { me, toast } = useApp();
  const [g, setG] = useState(start);
  // Start each person's stories at the first one you haven't seen (highlights always start at the beginning).
  const firstUnseen = (gi: number) => (highlight ? 0 : Math.max(0, groups[gi].stories.findIndex((s) => !s.seen)));
  const [s, setS] = useState(() => firstUnseen(start));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [reply, setReply] = useState("");
  const [menu, setMenu] = useState(false);
  const [viewers, setViewers] = useState(false);
  const [isMuted, toggleMute] = useMuted();
  const video = useRef<HTMLVideoElement>(null);

  const group = groups[g];
  const story = group.stories[s];
  const mine = group.user.id === me.id;
  const stopped = paused || holding || menu || viewers || reply.length > 0;

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  const next = useCallback(() => {
    if (s < group.stories.length - 1) setS(s + 1);
    else if (g < groups.length - 1) {
      setG(g + 1);
      setS(firstUnseen(g + 1));
    } else close();
    setProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, g, group, groups, close]);

  const prev = () => {
    if (s > 0) setS(s - 1);
    else if (g > 0) {
      setG(g - 1);
      setS(groups[g - 1].stories.length - 1);
    }
    setProgress(0);
  };

  // Mark as seen.
  useEffect(() => {
    if (!story.seen && !viewed.current.has(story.id)) {
      viewed.current.add(story.id);
      api(`/api/stories/${story.id}/view`, { method: "POST" }).catch(() => {});
    }
  }, [story]);

  // Image timer (videos drive progress from their own playback).
  useEffect(() => {
    if (story.kind !== "image" || stopped) return;
    const started = performance.now() - progress * IMAGE_MS;
    let raf = 0;
    const tick = (t: number) => {
      const p = (t - started) / IMAGE_MS;
      if (p >= 1) return next();
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, stopped, next]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (stopped) v.pause();
    else v.play().catch(() => {});
  }, [stopped, story]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") close();
      if (e.key === " ") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sendReply = async (text: string) => {
    if (!text.trim()) return;
    try {
      const { id } = await api<{ id: number }>("/api/conversations", { body: { username: group.user.username } });
      await api(`/api/conversations/${id}/messages`, { body: { text: text.trim() } });
      setReply("");
      toast("Message sent");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const deleteStory = async () => {
    setMenu(false);
    try {
      await api(`/api/stories/${story.id}`, { method: "DELETE" });
      toast("Story deleted.");
      const remaining = group.stories.filter((x) => x.id !== story.id);
      if (remaining.length === 0) return close();
      setGroups(groups.map((x, i) => (i === g ? { ...x, stories: remaining } : x)));
      setS(Math.min(s, remaining.length - 1));
      setProgress(0);
    } catch (error) {
      toast((error as Error).message || "Story could not be deleted.");
    }
  };

  const deleteHighlight = async () => {
    setMenu(false);
    await api(`/api/highlights/${highlight!.id}`, { method: "DELETE" });
    toast("Highlight deleted.");
    close();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1a1a1a]">
      <Link href="/" className="absolute left-5 top-4 hidden text-white md:block">
        <Logo />
      </Link>
      <button onClick={close} className="absolute right-4 top-4 z-10 hidden text-white md:block" aria-label="Close">
        <X size={32} />
      </button>

      <div className="relative flex h-full items-center">
        {(g > 0 || s > 0) && (
          <button onClick={prev} className="absolute -left-12 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-white/80 text-black md:flex" aria-label="Previous">
            <ChevronLeft size={20} />
          </button>
        )}

        <div className="relative h-full w-screen overflow-hidden bg-black md:my-4 md:aspect-[9/16] md:h-[calc(100vh-32px)] md:w-auto md:rounded-lg">
          {story.kind === "video" ? (
            <video
              key={story.id}
              ref={video}
              src={story.url}
              autoPlay
              playsInline
              muted={isMuted}
              className="h-full w-full object-contain"
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setProgress(v.currentTime / v.duration);
              }}
              onEnded={next}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={story.id} src={story.url} alt="" className="h-full w-full object-contain" draggable={false} />
          )}

          {/* Tap zones: left = previous, right = next; hold anywhere to pause */}
          <div
            className="absolute inset-0 flex"
            onPointerDown={() => setHolding(true)}
            onPointerUp={() => setHolding(false)}
            onPointerLeave={() => setHolding(false)}
          >
            <button className="h-full w-1/3" onClick={prev} aria-label="Previous story" />
            <button className="h-full w-2/3" onClick={next} aria-label="Next story" />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-4 pb-8 pt-5">
            <div className="flex gap-0.5">
              {group.stories.map((st, i) => (
                <span key={st.id} className="h-0.5 flex-1 overflow-hidden rounded bg-white/35">
                  <span className="block h-full bg-white" style={{ width: `${i < s ? 100 : i === s ? progress * 100 : 0}%` }} />
                </span>
              ))}
            </div>
            <div className="pointer-events-auto mt-3 flex items-center gap-2 text-white">
              <Link href={`/${group.user.username}`} className="flex items-center gap-2">
                <Avatar src={group.user.avatar} size={32} />
                <span className="font-semibold">{highlight ? highlight.title : group.user.username}</span>
              </Link>
              <span className="text-white/70">{timeAgo(story.createdAt)}</span>
              <span className="ml-auto flex items-center gap-4">
                {story.kind === "video" && (
                  <button onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                )}
                <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"}>
                  {paused ? <Play size={20} className="fill-white" /> : <Pause size={20} className="fill-white" />}
                </button>
                {mine && (
                  <button onClick={() => setMenu(true)} aria-label="More">
                    <MoreHorizontal size={22} />
                  </button>
                )}
                <button onClick={close} className="md:hidden" aria-label="Close">
                  <X size={26} />
                </button>
              </span>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-4">
            {mine ? (
              <button onClick={() => setViewers(true)} className="flex items-center gap-2 font-semibold text-white">
                <Eye size={20} /> Seen by
              </button>
            ) : (
              <>
                <form
                  className="flex-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendReply(reply);
                  }}
                >
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={`Reply to ${group.user.username}...`}
                    className="w-full rounded-full border border-white/60 bg-transparent px-4 py-2.5 text-white outline-none placeholder:text-white/80"
                  />
                </form>
                <button onClick={() => sendReply("❤️")} className="text-white" aria-label="Like story">
                  <Heart size={26} />
                </button>
                <button onClick={() => sendReply(reply || "👋")} className="text-white" aria-label="Send">
                  <Send size={24} />
                </button>
              </>
            )}
          </div>
        </div>

        {(g < groups.length - 1 || s < group.stories.length - 1) && (
          <button onClick={next} className="absolute -right-12 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-white/80 text-black md:flex" aria-label="Next">
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {menu && (
        <OptionsMenu
          onClose={() => setMenu(false)}
          options={[
            highlight
              ? { label: "Delete highlight", danger: true, onClick: deleteHighlight }
              : { label: "Delete", danger: true, onClick: deleteStory },
          ]}
        />
      )}
      {viewers && <UserListModal title="Viewers" url={`/api/stories/${story.id}`} onClose={() => setViewers(false)} />}
    </div>
  );
}
