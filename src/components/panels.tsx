"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleX, X } from "lucide-react";
import { api, timeAgo, timeBucket, useApi } from "@/lib/client";
import type { FollowUser, Notification, Post } from "@/lib/types";
import { useApp } from "./app-context";
import { FollowButton } from "./social";
import { Avatar, Spinner, Verified } from "./ui";

const RECENT_KEY = "snapgram:recent-searches";

function loadRecent(): FollowUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function storeRecent(users: FollowUser[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(users.slice(0, 20)));
  } catch {}
}

/** User search with "Recent" history, used in the desktop side panel and the mobile Explore page. */
export function SearchBox({ onNavigate, compactInput = false }: { onNavigate?: () => void; compactInput?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FollowUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<FollowUser[]>(loadRecent);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      setLoading(true);
      api<{ users: FollowUser[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.users))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const remember = (u: FollowUser) => {
    const next = [u, ...recent.filter((r) => r.id !== u.id)];
    setRecent(next);
    storeRecent(next);
    onNavigate?.();
  };
  const forget = (id: number) => {
    const next = recent.filter((r) => r.id !== id);
    setRecent(next);
    storeRecent(next);
  };

  const row = (u: FollowUser, removable: boolean) => (
    <div key={u.id} className="flex items-center hover:bg-hover">
      <Link href={`/${u.username}`} onClick={() => remember(u)} className="flex min-w-0 flex-1 items-center gap-3 px-6 py-2">
        <Avatar src={u.avatar} size={44} />
        <div className="min-w-0">
          <div className="flex items-center font-semibold">
            <span className="truncate">{u.username}</span>
            {u.verified && <Verified />}
          </div>
          <div className="truncate text-muted">
            {u.name}
            {u.isFollowing && " • Following"}
          </div>
        </div>
      </Link>
      {removable && (
        <button type="button" onClick={() => forget(u.id)} className="px-6 text-muted" aria-label="Remove">
          <X size={18} />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className={`${compactInput ? "px-4 py-2" : "border-b border-separator px-4 pb-6"}`}>
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            autoFocus={!compactInput}
            className="w-full rounded-lg bg-secondary px-4 py-[9px] text-base outline-none placeholder:text-muted md:text-sm"
          />
          {q &&
            (loading ? (
              <Spinner size={16} className="absolute right-3 top-1/2 -translate-y-1/2" />
            ) : (
              <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label="Clear">
                <CircleX size={16} className="fill-muted text-secondary" />
              </button>
            ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pt-3">
        {q.trim() && results ? (
          results.length ? (
            results.map((u) => row(u, false))
          ) : (
            <p className="px-6 py-4 text-center text-muted">No results found.</p>
          )
        ) : (
          <>
            <div className="flex items-center justify-between px-6 pb-2 pt-1">
              <span className="text-base font-semibold">Recent</span>
              {recent.length > 0 && (
                <button
                  type="button"
                  className="font-semibold text-link hover:text-link-text"
                  onClick={() => {
                    setRecent([]);
                    storeRecent([]);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            {recent.length ? (
              recent.map((u) => row(u, true))
            ) : (
              <p className="flex h-40 items-center justify-center font-semibold text-muted">No recent searches.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function notificationText(n: Notification) {
  switch (n.type) {
    case "like":
      return "liked your post.";
    case "comment":
      return `commented: ${n.text}`;
    case "comment_like":
      return `liked your comment: ${n.text}`;
    case "follow":
      return "started following you.";
  }
}

export function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useApi<{ notifications: Notification[] }>("/api/notifications");
  const { refreshUnread, openPost } = useApp();

  useEffect(() => {
    if (data) api("/api/notifications", { method: "POST" }).then(refreshUnread);
  }, [data, refreshUnread]);

  if (!data)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (!data.notifications.length)
    return (
      <div className="flex flex-col items-center px-8 py-16 text-center">
        <p className="font-semibold">Activity on your posts</p>
        <p className="mt-2 text-muted">When someone likes or comments on one of your posts, you&apos;ll see it here.</p>
      </div>
    );

  const groups = new Map<string, Notification[]>();
  for (const n of data.notifications) {
    const b = timeBucket(n.createdAt);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(n);
  }

  return (
    <div>
      {[...groups].map(([bucket, items], gi) => (
        <section key={bucket} className={`py-2 ${gi > 0 ? "border-t border-separator" : ""}`}>
          <h3 className="px-6 pb-2 pt-2 text-base font-bold">{bucket}</h3>
          {items.map((n) => (
            <div key={n.id} className={`flex items-center gap-3 px-6 py-2 ${n.read ? "" : "bg-link/5"}`}>
              <Link href={`/${n.actor.username}`} onClick={onNavigate}>
                <Avatar src={n.actor.avatar} size={44} />
              </Link>
              <div className="min-w-0 flex-1 break-words leading-[18px]">
                <Link href={`/${n.actor.username}`} onClick={onNavigate} className="font-semibold">
                  {n.actor.username}
                </Link>{" "}
                {notificationText(n)} <span className="text-muted">{timeAgo(n.createdAt)}</span>
              </div>
              {n.post ? (
                <button
                  onClick={() =>
                    api<{ post: Post }>(`/api/posts/${n.post!.id}`).then((d) => openPost(d.post))
                  }
                  className="h-11 w-11 shrink-0 overflow-hidden rounded"
                >
                  {n.post.thumb.kind === "video" ? (
                    <video src={n.post.thumb.url} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.post.thumb.url} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              ) : (
                n.type === "follow" && (
                  <FollowButton username={n.actor.username} isFollowing={n.actor.isFollowing} followsYou />
                )
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Desktop slide-out panel next to the collapsed sidebar (Search / Notifications). */
export function SidePanel({ kind, onClose }: { kind: "search" | "notifications"; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <aside className="animate-panel fixed bottom-0 left-[72px] top-0 z-40 flex w-[397px] flex-col rounded-r-2xl border-r border-separator bg-bg shadow-[4px_0_24px_rgba(0,0,0,0.15)]">
        <h2 className="px-6 pb-9 pt-6 text-2xl font-semibold">{kind === "search" ? "Search" : "Notifications"}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {kind === "search" ? <SearchBox onNavigate={onClose} /> : <NotificationList onNavigate={onClose} />}
        </div>
      </aside>
    </>
  );
}
