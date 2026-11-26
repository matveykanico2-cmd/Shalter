"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { Bookmark, Camera, ChevronDown, ChevronLeft, Clapperboard, Gift, Grid3x3, Menu, MoreHorizontal, Pin, Settings, SquarePlus, UserPlus } from "lucide-react";
import { api, compact, useApi, useOnCreated } from "@/lib/client";
import type { Post, Profile } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { PostGrid } from "@/components/post-view";
import { HighlightsRow } from "@/components/highlights";
import { FollowButton, RichText, UserListModal } from "@/components/social";
import { Avatar, SecondaryButton, Spinner, Verified } from "@/components/ui";

type Tab = "posts" | "reels" | "saved";

function Stat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="font-semibold">{compact(n)}</span> <span className="max-md:block max-md:text-muted">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="max-md:flex-1 max-md:text-center">
      {inner}
    </button>
  ) : (
    <span className="max-md:flex-1 max-md:text-center">{inner}</span>
  );
}

/** Phone profile count: bold number over its label, as in the Instagram app. */
function PhoneStat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="block text-base font-bold leading-5">{compact(n)}</span>
      <span className="block leading-4">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="text-left">
      {inner}
    </button>
  ) : (
    <span>{inner}</span>
  );
}

/** "Followed by a, b + 3 more" with the first few avatars; opens the full list. */
function FollowedBy({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const { users, count } = profile.mutuals;
  if (count === 0) return null;
  const more = count - Math.min(users.length, 2);
  return (
    <button onClick={onOpen} className="mt-3 flex items-center gap-2 text-left text-xs text-muted">
      <span className="flex shrink-0">
        {users.map((u, i) => (
          <Avatar key={u.id} src={u.avatar} size={20} className={i > 0 ? "-ml-2 ring-2 ring-bg" : "ring-2 ring-bg"} />
        ))}
      </span>
      <span>
        Followed by{" "}
        {users.slice(0, 2).map((u, i) => (
          <span key={u.id}>
            {i > 0 && ", "}
            <span className="font-semibold text-fg">{u.username}</span>
          </span>
        ))}
        {more > 0 && ` + ${more} more`}
      </span>
    </button>
  );
}

function ProfileContent() {
  const { username } = useParams<{ username: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { setCreateOpen, toast } = useApp();
  const tab = (search.get("tab") as Tab) || "posts";

  const profileUrl = username ? `/api/users/${encodeURIComponent(username)}` : null;
  const profileReq = useApi<{ profile: Profile }>(profileUrl);
  const postsReq = useApi<{ posts: Post[] }>(profileReq.data && username ? `/api/users/${encodeURIComponent(username)}/posts?tab=${tab}` : null);
  const giftsReq = useApi<{ gifts: { id: number; name: string; emoji: string; price: number; pinned: boolean; createdAt: number; senderUsername: string }[] }>(profileReq.data && username ? `/api/users/${encodeURIComponent(username)}/gifts` : null);
  const [list, setList] = useState<"followers" | "following" | "mutual" | null>(null);

  const { reload: reloadProfile } = profileReq;
  const { reload: reloadPosts } = postsReq;
  useOnCreated(
    useCallback(() => {
      reloadProfile();
      reloadPosts();
    }, [reloadProfile, reloadPosts]),
  );

  if (profileReq.error) return <div className="mx-auto max-w-[520px] px-6 py-20 text-center"><h2 className="text-xl font-bold">Profile could not be loaded</h2><p className="mt-2 text-sm text-muted">{profileReq.error}</p><button type="button" onClick={profileReq.reload} className="mt-5 font-semibold text-link">Try again</button></div>;
  const p = profileReq.data?.profile;
  if (!p)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  const setFollowing = (following: boolean) =>
    profileReq.setData({
      profile: { ...p, isFollowing: following, followerCount: p.followerCount + (following ? 1 : -1) },
    });

  const message = async () => {
    try {
      const { id } = await api<{ id: number }>("/api/conversations", { body: { username: p.username } });
      router.push(`/direct/t/${id}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const buttons = p.isMe ? (
    <>
      <SecondaryButton onClick={() => router.push("/accounts/edit")} className="max-md:flex-1">
        Edit profile
      </SecondaryButton>
      <SecondaryButton onClick={() => setCreateOpen(true)} className="max-md:flex-1">
        Share new post
      </SecondaryButton>
    </>
  ) : (
    <>
      <span className="max-md:flex-1 max-md:[&>button]:w-full">
        <FollowButton username={p.username} isFollowing={p.isFollowing} followsYou={p.followsYou} onChange={setFollowing} />
      </span>
      <SecondaryButton onClick={message} className="max-md:flex-1">
        Message
      </SecondaryButton>
      <SecondaryButton aria-label="Suggested accounts" className="px-2" onClick={() => router.push("/explore/people")}>
        <UserPlus size={16} />
      </SecondaryButton>
    </>
  );

  const shareProfile = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/${p.username}`);
      toast("Profile link copied.");
    } catch {
      toast("Couldn't copy the link.");
    }
  };

  const avatar = (size: number) =>
    p.hasStory ? (
      <Link href={`/stories/${p.username}`}>
        <Avatar src={p.avatar} size={size} ring="unseen" />
      </Link>
    ) : (
      <Avatar src={p.avatar} size={size} />
    );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "posts", label: "Posts", icon: <Grid3x3 size={12} strokeWidth={2.5} /> },
    { id: "reels", label: "Reels", icon: <Clapperboard size={12} strokeWidth={2.5} /> },
    ...(p.isMe ? [{ id: "saved" as Tab, label: "Saved", icon: <Bookmark size={12} strokeWidth={2.5} /> }] : []),
  ];

  const posts = postsReq.data?.posts;
  const toggleGift = async (gift: { id: number; pinned: boolean }) => {
    if (!username) return;
    try {
      await api(`/api/users/${encodeURIComponent(username)}/gifts`, { method: "PATCH", body: { id: gift.id, pinned: !gift.pinned } });
      giftsReq.reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[975px] md:px-5 md:pt-8">
      {/* Phone top bar, like the Instagram app */}
      {p.isMe ? (
        <header className="sticky top-0 z-20 flex h-[52px] items-center gap-5 bg-bg px-4 md:hidden">
          <h1 className="flex min-w-0 flex-1 items-center gap-1 text-xl font-bold">
            <span className="truncate">{p.username}</span>
            {p.verified && <Verified size={14} />}
            <ChevronDown size={18} className="shrink-0" />
          </h1>
          <button onClick={() => setCreateOpen(true)} aria-label="Create">
            <SquarePlus size={26} />
          </button>
          <Link href="/accounts/edit" aria-label="Settings">
            <Menu size={26} />
          </Link>
        </header>
      ) : (
        <header className="sticky top-0 z-20 flex h-[52px] items-center bg-bg px-3 md:hidden">
          <button onClick={() => router.back()} aria-label="Back">
            <ChevronLeft size={30} />
          </button>
          <h1 className="flex min-w-0 flex-1 items-center justify-center text-base font-bold">
            <span className="truncate">{p.username}</span>
            {p.verified && <Verified size={14} />}
          </h1>
          <button onClick={shareProfile} aria-label="Options">
            <MoreHorizontal size={24} />
          </button>
        </header>
      )}

      {/* Desktop header */}
      <section className="mb-11 hidden items-start md:flex">
        <div className="flex w-[290px] shrink-0 justify-center pr-7">{avatar(150)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-3 flex items-center text-xl">
              {p.username}
              {p.verified && <Verified size={18} />}
            </h2>
            {buttons}
            {p.isMe && (
              <Link href="/accounts/edit" className="p-2" aria-label="Settings">
                <Settings size={24} />
              </Link>
            )}
          </div>
          <div className="mt-5 flex gap-10 text-base">
            <Stat n={p.postCount} label={p.postCount === 1 ? "post" : "posts"} />
            <Stat n={p.followerCount} label={p.followerCount === 1 ? "follower" : "followers"} onClick={() => setList("followers")} />
            <Stat n={p.followingCount} label="following" onClick={() => setList("following")} />
          </div>
          <div className="mt-5">
            {(p.name || p.lastName) && <div className="font-semibold">{[p.name, p.lastName].filter(Boolean).join(" ")}</div>}
            {p.isBusiness && p.businessCategory && <div className="text-muted">{p.businessCategory}</div>}
            {p.bio && (
              <div className="whitespace-pre-line">
                <RichText text={p.bio} />
              </div>
            )}
            {p.website && (
              <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="font-semibold text-link-text hover:underline">
                {p.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <FollowedBy profile={p} onOpen={() => setList("mutual")} />
          </div>
        </div>
      </section>

      {/* Phone header, like the Instagram app: photo + counts, then name and bio, then buttons */}
      <section className="md:hidden">
        <div className="flex items-center gap-6 px-4 pt-2">
          {avatar(86)}
          <div className="flex min-w-0 flex-1 justify-between">
            <PhoneStat n={p.postCount} label={p.postCount === 1 ? "post" : "posts"} />
            <PhoneStat n={p.followerCount} label={p.followerCount === 1 ? "follower" : "followers"} onClick={() => setList("followers")} />
            <PhoneStat n={p.followingCount} label="following" onClick={() => setList("following")} />
          </div>
        </div>
        <div className="px-4 pt-3">
          {(p.name || p.lastName) && <div className="font-semibold">{[p.name, p.lastName].filter(Boolean).join(" ")}</div>}
          {p.isBusiness && p.businessCategory && <div className="text-muted">{p.businessCategory}</div>}
          {p.bio && (
            <div className="whitespace-pre-line">
              <RichText text={p.bio} />
            </div>
          )}
          {p.website && (
            <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="font-semibold text-link-text">
              {p.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          <FollowedBy profile={p} onOpen={() => setList("mutual")} />
        </div>
        <div className="flex gap-1.5 px-4 pb-1 pt-3">
          {p.isMe ? (
            <>
              <SecondaryButton onClick={() => router.push("/accounts/edit")} className="flex-1">
                Edit profile
              </SecondaryButton>
              <SecondaryButton onClick={shareProfile} className="flex-1">
                Share profile
              </SecondaryButton>
              <SecondaryButton aria-label="Suggested accounts" className="px-2" onClick={() => router.push("/explore/people")}>
                <UserPlus size={16} />
              </SecondaryButton>
            </>
          ) : (
            buttons
          )}
        </div>
      </section>

      {giftsReq.error ? <div className="mb-5 px-4 text-center text-sm text-muted"><span>Gifts could not be loaded.</span><button type="button" onClick={giftsReq.reload} className="ml-2 font-semibold text-link">Retry</button></div> : giftsReq.data?.gifts.length ? <section className="mb-8 px-4 md:px-0"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><Gift size={17} className="text-link" />Gifts</div><div className="flex gap-3 overflow-x-auto pb-1">{giftsReq.data.gifts.map((gift) => <div key={gift.id} className="relative flex min-w-[112px] flex-col items-center rounded-2xl border border-border bg-elevated px-3 py-3 text-center shadow-sm"><span className="text-4xl">{gift.emoji}</span><span className="mt-1 text-xs font-bold">{gift.name}</span><span className="text-[10px] text-muted">from @{gift.senderUsername}</span>{p.isMe && <button type="button" onClick={() => void toggleGift(gift)} className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${gift.pinned ? "bg-link/10 text-link" : "bg-field text-muted"}`}><Pin size={10} />{gift.pinned ? "Pinned" : "Pin"}</button>}</div>)}</div></section> : null}
      <HighlightsRow username={p.username} isMe={p.isMe} />

      <div className="flex justify-center gap-14 border-t border-separator max-md:justify-around max-md:gap-0 max-md:border-t-0">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.id === "posts" ? `/${p.username}` : `/${p.username}?tab=${t.id}`}
            replace
            scroll={false}
            className={`-mt-px flex h-[52px] items-center gap-1.5 text-xs font-semibold uppercase tracking-wider max-md:h-11 max-md:flex-1 max-md:justify-center max-md:[&_svg]:size-6 ${
              tab === t.id ? "border-t border-fg text-fg max-md:border-t-0 max-md:border-b" : "text-muted"
            }`}
          >
            {t.icon}
            <span className="max-md:hidden">{t.label}</span>
          </Link>
        ))}
      </div>

      {postsReq.error ? (
        <div className="flex flex-col items-center px-8 py-16 text-center"><p className="text-danger">Posts could not be loaded.</p><button type="button" onClick={postsReq.reload} className="mt-4 font-semibold text-link">Try again</button></div>
      ) : !posts ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <span className="mb-4 rounded-full border-2 border-fg p-4">
            {tab === "saved" ? <Bookmark size={34} strokeWidth={1.5} /> : tab === "reels" ? <Clapperboard size={34} strokeWidth={1.5} /> : <Camera size={34} strokeWidth={1.5} />}
          </span>
          <h3 className="text-3xl font-extrabold">
            {tab === "saved" ? "Save" : tab === "reels" ? (p.isMe ? "Share a moment with the world" : "No reels yet") : p.isMe ? "Share Photos" : "No Posts Yet"}
          </h3>
          <p className="mt-3 max-w-[350px]">
            {tab === "saved"
              ? "Save photos and videos that you want to see again. No one is notified, and only you can see what you've saved."
              : p.isMe
                ? "When you share photos, they will appear on your profile."
                : ""}
          </p>
          {p.isMe && tab !== "saved" && (
            <button onClick={() => setCreateOpen(true)} className="mt-4 font-semibold text-link hover:text-link-text">
              {tab === "reels" ? "Create your first reel" : "Share your first photo"}
            </button>
          )}
        </div>
      ) : (
        <PostGrid
          posts={posts}
          onChange={(id, np) => {
            postsReq.setData({
              posts: np ? posts.map((x) => (x.id === id ? np : x)) : posts.filter((x) => x.id !== id),
            });
            if (!np) profileReq.setData({ profile: { ...p, postCount: p.postCount - 1 } });
          }}
        />
      )}

      {list && (
        <UserListModal
          title={list === "followers" ? "Followers" : list === "following" ? "Following" : "Followers you know"}
          url={list === "mutual" ? `/api/users/${p.username}/followers?mutual=1` : `/api/users/${p.username}/${list}`}
          onClose={() => {
            setList(null);
            reloadProfile();
          }}
        />
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
