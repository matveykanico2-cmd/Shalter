import { route, HttpError } from "@/lib/server/http";
import { all, run, now } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { saveUpload } from "@/lib/server/media";
import { userLite } from "@/lib/server/queries";
import type { StoryGroup } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

// Active stories from you and the people you follow, grouped by user.
// ?include=<username> also adds that user's stories (e.g. when opened from their profile).
export const GET = route(async (req) => {
  const me = await requireUser();
  const include = new URL(req.url).searchParams.get("include") ?? "";
  const rows = all<{
    id: number;
    url: string;
    kind: "image" | "video";
    created_at: number;
    seen: number;
    uid: number;
    username: string;
    name: string;
    avatar: string | null;
    verified: number;
  }>(
    `SELECT s.id, s.url, s.kind, s.created_at,
       EXISTS (SELECT 1 FROM story_views WHERE story_id = s.id AND user_id = ?) AS seen,
       u.id AS uid, u.username, u.name, u.avatar, u.verified
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > ? AND (s.user_id = ? OR u.username = ?
       OR s.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?))
     ORDER BY s.id`,
    me.id,
    now(),
    me.id,
    include,
    me.id,
  );

  const groups = new Map<number, StoryGroup>();
  for (const r of rows) {
    if (!groups.has(r.uid)) groups.set(r.uid, { user: userLite(r), stories: [], allSeen: true });
    const g = groups.get(r.uid)!;
    g.stories.push({ id: r.id, url: r.url, kind: r.kind, createdAt: r.created_at, seen: !!r.seen });
    if (!r.seen) g.allSeen = false;
  }
  // Yours first, then unseen, then seen; most recent first within each.
  const list = [...groups.values()].sort((a, b) => {
    if (a.user.id === me.id) return -1;
    if (b.user.id === me.id) return 1;
    if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
    return b.stories.at(-1)!.createdAt - a.stories.at(-1)!.createdAt;
  });
  return { groups: list };
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a photo or video.");
  const media = await saveUpload(file);
  const t = now();
  const { id } = run(
    "INSERT INTO stories (user_id, url, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    me.id,
    media.url,
    media.kind,
    t,
    t + DAY,
  );
  return { id };
});
