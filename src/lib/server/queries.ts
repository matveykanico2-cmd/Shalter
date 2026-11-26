import "server-only";
import type { SQLInputValue } from "node:sqlite";
import { all, get, run, now } from "./db";
import type { Comment, FollowUser, Media, Post, UserLite } from "@/lib/types";
import { sendPush } from "./push";

type UserCols = { uid: number; username: string; name: string; avatar: string | null; verified: number };

export const userLite = (r: UserCols): UserLite => ({
  id: r.uid,
  username: r.username,
  name: r.name,
  avatar: r.avatar,
  verified: !!r.verified,
});

type PostRow = UserCols & {
  id: number;
  type: "post" | "reel";
  caption: string;
  location: string;
  created_at: number;
  like_count: number;
  comment_count: number;
  liked: number;
  saved: number;
  is_following: number;
  liked_by: string | null;
};

/**
 * Loads posts with everything the UI needs. `where` and `tail` are SQL fragments
 * (tail = ORDER BY / LIMIT); `p` is the posts alias and `u` the author alias.
 */
export function queryPosts(viewerId: number, where: string, params: SQLInputValue[], tail: string): Post[] {
  const rows = all<PostRow>(
    `SELECT p.id, p.type, p.caption, p.location, p.created_at,
       u.id AS uid, u.username, u.name, u.avatar, u.verified,
       (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
       (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
       EXISTS (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = :viewer) AS liked,
       EXISTS (SELECT 1 FROM saves WHERE post_id = p.id AND user_id = :viewer) AS saved,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = :viewer AND following_id = u.id) AS is_following,
       (SELECT lu.username FROM likes l
          JOIN follows f ON f.following_id = l.user_id AND f.follower_id = :viewer
          JOIN users lu ON lu.id = l.user_id
        WHERE l.post_id = p.id ORDER BY l.created_at DESC LIMIT 1) AS liked_by
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE ${where} ${tail}`,
    { viewer: viewerId } as never,
    ...params,
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const media = all<{ post_id: number; url: string; kind: Media["kind"] }>(
    `SELECT post_id, url, kind FROM post_media WHERE post_id IN (${ids.map(() => "?").join(",")}) ORDER BY position`,
    ...ids,
  );
  const byPost = new Map<number, Media[]>();
  for (const m of media) {
    if (!byPost.has(m.post_id)) byPost.set(m.post_id, []);
    byPost.get(m.post_id)!.push({ url: m.url, kind: m.kind });
  }

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    caption: r.caption,
    location: r.location,
    createdAt: r.created_at,
    user: { ...userLite(r), isFollowing: !!r.is_following },
    media: byPost.get(r.id) ?? [],
    likeCount: r.like_count,
    commentCount: r.comment_count,
    liked: !!r.liked,
    saved: !!r.saved,
    likedBy: r.liked_by,
  }));
}

export function queryComments(viewerId: number, postId: number): Comment[] {
  return all<UserCols & { id: number; text: string; created_at: number; like_count: number; liked: number }>(
    `SELECT c.id, c.text, c.created_at, u.id AS uid, u.username, u.name, u.avatar, u.verified,
       (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS like_count,
       EXISTS (SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = ?) AS liked
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? ORDER BY c.id`,
    viewerId,
    postId,
  ).map((r) => ({
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
    user: userLite(r),
    likeCount: r.like_count,
    liked: !!r.liked,
  }));
}

/** Users matching a WHERE clause (alias `u`), annotated with whether the viewer follows them. */
export function queryUsers(viewerId: number, from: string, params: SQLInputValue[]): FollowUser[] {
  return all<UserCols & { is_following: number }>(
    `SELECT u.id AS uid, u.username, u.name, u.avatar, u.verified,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) AS is_following
     ${from}`,
    viewerId,
    ...params,
  ).map((r) => ({ ...userLite(r), isFollowing: !!r.is_following, isMe: r.uid === viewerId }));
}

export function firstMedia(postId: number): Media {
  return (
    get<Media>("SELECT url, kind FROM post_media WHERE post_id = ? ORDER BY position LIMIT 1", postId) ?? {
      url: "",
      kind: "image",
    }
  );
}

export function notify(userId: number, actorId: number, type: string, postId: number | null = null, text = "") {
  if (userId === actorId) return;
  run(
    "INSERT INTO notifications (user_id, actor_id, type, post_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    userId,
    actorId,
    type,
    postId,
    text,
    now(),
  );
  void sendPush(userId, { title: "shalter", body: text || `${type} activity`, url: postId ? `/p/${postId}` : "/notifications" });
}

export function unnotify(userId: number, actorId: number, type: string, postId: number | null = null) {
  run(
    "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id IS ?",
    userId,
    actorId,
    type,
    postId,
  );
}
