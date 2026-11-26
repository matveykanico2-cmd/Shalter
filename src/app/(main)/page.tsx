"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api, BASE_PATH, useApi, useOnCreated } from "@/lib/client";
import type { FollowUser, Post } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { MobileHomeHeader } from "@/components/nav";
import { PostCard } from "@/components/post-card";
import { FollowButton } from "@/components/social";
import { StoriesBar } from "@/components/stories-bar";
import { Avatar, Spinner, UserName } from "@/components/ui";

type Suggestion = FollowUser & { reason: string };

function Suggestions({ limit = 5, big = false }: { limit?: number; big?: boolean }) {
  const { data } = useApi<{ users: Suggestion[] }>(`/api/suggestions?limit=${limit}`);
  if (!data?.users.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className={`font-semibold ${big ? "text-base" : "text-muted"}`}>Suggested for you</span>
        {!big && (
          <Link href="/explore/people" className="text-xs font-semibold hover:text-muted">
            See All
          </Link>
        )}
      </div>
      {data.users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 py-2">
          <Link href={`/${u.username}`}>
            <Avatar src={u.avatar} size={big ? 44 : 44} />
          </Link>
          <div className="min-w-0 flex-1 leading-4">
            <UserName user={u} />
            <div className="truncate text-xs text-muted">{u.reason}</div>
          </div>
          {big ? (
            <FollowButton username={u.username} isFollowing={u.isFollowing} />
          ) : (
            <FollowButton variant="link" username={u.username} isFollowing={u.isFollowing} />
          )}
        </div>
      ))}
    </div>
  );
}

function RightColumn() {
  const { me } = useApp();
  return (
    <aside className="hidden w-[319px] shrink-0 pl-16 pt-9 lg:block">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/${me.username}`}>
          <Avatar src={me.avatar} size={44} />
        </Link>
        <div className="min-w-0 flex-1 leading-4">
          <UserName user={me} />
          <div className="truncate text-muted">{me.name}</div>
        </div>
        <button
          className="text-xs font-semibold text-link hover:text-link-text"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" });
            window.location.replace(`${BASE_PATH}/accounts/login`);
          }}
        >
          Switch
        </button>
      </div>
      <Suggestions />
      <footer className="mt-8 text-xs leading-5 text-muted/70">
        About · Help · Press · API · Jobs · Privacy · Terms · Locations · Language
        <div className="mt-4 uppercase">© {new Date().getFullYear()} shalter · Производство: Николенко Матвей</div>
      </footer>
    </aside>
  );
}

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const seed = useRef(0);

  const load = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setFeedError(null);
    try {
      if (reset) seed.current = Math.floor(Math.random() * 1_000_000) + 1; // new shuffle each visit
      const offset = reset ? 0 : posts.length;
      const d = await api<{ posts: Post[]; hasMore: boolean }>(`/api/feed?seed=${seed.current}&offset=${offset}`);
      setPosts((p) => (reset ? d.posts : [...p, ...d.posts.filter((n) => !p.some((x) => x.id === n.id))]));
      setHasMore(d.hasMore);
      setLoadedOnce(true);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "Couldn't load your feed.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [posts]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    loadRef.current(true);
  }, []);

  useOnCreated(useCallback(() => loadRef.current(true), []));

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadRef.current(), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadedOnce]);

  return (
    <>
      <MobileHomeHeader />
      <div className="flex justify-center md:px-4">
        <div className="w-full max-w-[630px] md:pt-4">
          <div className="mx-auto max-w-[470px] md:max-w-[630px]">
            <StoriesBar />
          </div>
          <div className="mx-auto max-w-[470px]">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onRemove={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
            ))}
            <div ref={sentinel} />
            {loading && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}
            {feedError && !loading && (
              <div className="mx-3 my-8 rounded-xl border border-border bg-secondary/40 px-5 py-6 text-center">
                <h2 className="text-base font-semibold">Your feed couldn&apos;t load</h2>
                <p className="mt-1 text-muted">Check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => load(true)}
                  className="mt-4 rounded-lg bg-link px-4 py-2 text-sm font-semibold text-white hover:bg-link-hover"
                >
                  Try again
                </button>
              </div>
            )}
            {loadedOnce && !hasMore && posts.length > 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <CircleCheck size={80} strokeWidth={1} className="story-ring rounded-full text-white" />
                <p className="mt-4 text-xl">You&apos;re all caught up</p>
                <p className="mt-1 text-muted">You&apos;ve seen all new posts from the past 3 days.</p>
              </div>
            )}
            {loadedOnce && posts.length === 0 && (
              <div className="px-4 py-8">
                <h2 className="mb-1 text-xl font-semibold">Welcome to shalter</h2>
                <p className="mb-6 text-muted">Follow people to start seeing the photos and videos they share.</p>
                <Suggestions limit={15} big />
              </div>
            )}
          </div>
        </div>
        <RightColumn />
      </div>
    </>
  );
}
