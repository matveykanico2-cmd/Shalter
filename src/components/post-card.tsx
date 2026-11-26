"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Music } from "lucide-react";
import { api, compact, timeAgo, useIsPhone } from "@/lib/client";
import type { Post } from "@/lib/types";
import { useApp } from "./app-context";
import { ActionBar, usePostToggles } from "./post-actions";
import { MediaCarousel } from "./media";
import { Caption, UserListModal } from "./social";
import { Avatar, OptionsMenu, UserName } from "./ui";

export function LikesLine({ post, onOpen }: { post: Post; onOpen: () => void }) {
  if (post.likeCount === 0) return <div className="text-sm">Be the first to <span className="font-semibold">like this</span></div>;
  if (post.likedBy && !post.liked && post.likeCount > 1) {
    return (
      <div>
        Liked by <Link href={`/${post.likedBy}`} className="font-semibold">{post.likedBy}</Link> and{" "}
        <button className="font-semibold" onClick={onOpen}>others</button>
      </div>
    );
  }
  return (
    <button className="font-semibold" onClick={onOpen}>
      {compact(post.likeCount)} {post.likeCount === 1 ? "like" : "likes"}
    </button>
  );
}

/** "..." menu on a post, with the options Instagram shows for your own vs. others' posts. */
export function PostMenu({
  post,
  onClose,
  onDeleted,
  onUnfollow,
  hideGoToPost,
}: {
  post: Post;
  onClose: () => void;
  onDeleted: () => void;
  onUnfollow?: () => void;
  hideGoToPost?: boolean;
}) {
  const { me, toast, openShare } = useApp();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = post.user.id === me.id;

  const copyLink = () => {
    navigator.clipboard?.writeText(`${location.origin}/p/${post.id}`);
    toast("Link copied to clipboard.");
    onClose();
  };

  if (confirmDelete) {
    return (
      <OptionsMenu
        onClose={onClose}
        options={[
          {
            label: "Delete",
            danger: true,
            onClick: async () => {
              try {
                await api(`/api/posts/${post.id}`, { method: "DELETE" });
                toast("Post deleted.");
                onClose();
                onDeleted();
              } catch (error) {
                toast((error as Error).message || "Post could not be deleted.");
              }
            },
          },
        ]}
      />
    );
  }

  const options = [
    ...(mine ? [{ label: "Delete", danger: true, onClick: () => setConfirmDelete(true) }] : []),
    ...(!mine && post.user.isFollowing
      ? [
          {
            label: "Unfollow",
            danger: true,
            onClick: async () => {
              await api(`/api/users/${post.user.username}/follow`, { method: "DELETE" });
              toast(`Unfollowed ${post.user.username}.`);
              onUnfollow?.();
              onClose();
            },
          },
        ]
      : []),
    ...(hideGoToPost ? [] : [{ label: "Go to post", onClick: () => router.push(`/p/${post.id}`) }]),
    { label: "Share to...", onClick: () => (onClose(), openShare(post)) },
    { label: "Copy link", onClick: copyLink },
    { label: "About this account", onClick: () => router.push(`/${post.user.username}`) },
  ];
  return <OptionsMenu onClose={onClose} options={options} />;
}

export function PostCard({ post: initial, onRemove }: { post: Post; onRemove: (id: number) => void }) {
  const [post, setPost] = useState(initial);
  const { openPost, toast, me } = useApp();
  const { like, save } = usePostToggles(post, setPost);
  const [menu, setMenu] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [comment, setComment] = useState("");
  const [myComments, setMyComments] = useState<string[]>([]);
  // Phones show reels like the Instagram app: tall 9:16 video with the account overlaid on top.
  const phoneReel = useIsPhone() && post.media.length === 1 && post.media[0].kind === "video";

  const open = () => openPost(post, (p) => (p ? setPost(p) : onRemove(post.id)));

  const submit = async () => {
    const text = comment.trim();
    if (!text) return;
    setComment("");
    try {
      await api(`/api/posts/${post.id}/comments`, { body: { text } });
      setMyComments((c) => [...c, text]);
      setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
    } catch (e) {
      toast((e as Error).message);
      setComment(text);
    }
  };

  return (
    <article className="mb-5 border-b border-separator pb-5 md:mb-4">
      {phoneReel ? (
        <div className="relative">
          <MediaCarousel media={post.media} onDoubleTap={() => like(true)} aspect="9/16" />
          <header className="absolute inset-x-0 top-0 flex items-center gap-2.5 bg-gradient-to-b from-black/50 to-transparent px-3 pb-8 pt-3 text-white">
            <Link href={`/${post.user.username}`} className="rounded-full p-[2px] story-ring">
              <Avatar src={post.user.avatar} size={36} className="border-2 border-bg" />
            </Link>
            <div className="min-w-0 flex-1 leading-5 drop-shadow">
              <Link href={`/${post.user.username}`} className="block truncate text-[15px] font-semibold">
                {post.user.username}
              </Link>
              <div className="flex items-center gap-1 truncate text-[13px]">
                <Music size={13} /> {post.user.username} · Original audio
              </div>
            </div>
            <button onClick={() => setMenu(true)} className="p-1 drop-shadow" aria-label="More options">
              <MoreHorizontal size={24} />
            </button>
          </header>
        </div>
      ) : (
        <>
      <header className="flex items-center gap-2.5 px-3 pb-3 md:px-1">
        <Link href={`/${post.user.username}`}>
          <Avatar src={post.user.avatar} size={32} />
        </Link>
        <div className="min-w-0 flex-1 leading-[18px]">
          <div className="flex items-center">
            <UserName user={post.user} />
            <span className="mx-1 text-muted">•</span>
            <Link href={`/p/${post.id}`} className="text-muted" title={new Date(post.createdAt).toLocaleString()}>
              {timeAgo(post.createdAt)}
            </Link>
          </div>
          {post.location && <div className="truncate text-xs">{post.location}</div>}
        </div>
        <button onClick={() => setMenu(true)} className="p-2 hover:opacity-50" aria-label="More options">
          <MoreHorizontal size={22} />
        </button>
      </header>

      <div className="overflow-hidden border-separator md:rounded-[4px] md:border">
        <MediaCarousel media={post.media} onDoubleTap={() => like(true)} />
      </div>
        </>
      )}

      <div className="px-3 md:px-0">
        <div className={post.media.length > 1 ? "mt-1" : ""}>
          <ActionBar post={post} onLike={() => like()} onSave={save} onComment={open} />
        </div>
        <LikesLine post={post} onOpen={() => setShowLikes(true)} />
        <div className="mt-2">
          <Caption user={post.user} text={post.caption} />
        </div>
        {post.commentCount > myComments.length && (
          <button className="mt-2 block text-muted" onClick={open}>
            {post.commentCount - myComments.length === 1 && myComments.length === 0
              ? "View 1 comment"
              : `View all ${compact(post.commentCount)} comments`}
          </button>
        )}
        {myComments.map((c, i) => (
          <div key={i} className="mt-1 break-words">
            <UserName user={me} className="mr-1" />
            {c}
          </div>
        ))}
        <form
          className="mt-2 flex items-center"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-muted"
            maxLength={2200}
          />
          {comment.trim() && <button className="ml-2 font-semibold text-link hover:text-link-text">Post</button>}
        </form>
      </div>

      {menu && (
        <PostMenu
          post={post}
          onClose={() => setMenu(false)}
          onDeleted={() => onRemove(post.id)}
          onUnfollow={() => setPost((p) => ({ ...p, user: { ...p.user, isFollowing: false } }))}
        />
      )}
      {showLikes && <UserListModal title="Likes" url={`/api/posts/${post.id}/likes`} onClose={() => setShowLikes(false)} />}
    </article>
  );
}
