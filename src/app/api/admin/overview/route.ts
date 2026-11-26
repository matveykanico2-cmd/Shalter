import { route } from "@/lib/server/http";
import { all, get } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/admin";

export const GET = route(async () => {
  await requireAdmin();
  return {
    stats: {
      users: get<{ n: number }>("SELECT COUNT(*) AS n FROM users")!.n,
      posts: get<{ n: number }>("SELECT COUNT(*) AS n FROM posts")!.n,
      stories: get<{ n: number }>("SELECT COUNT(*) AS n FROM stories WHERE expires_at > ?", Date.now())!.n,
      messages: get<{ n: number }>("SELECT COUNT(*) AS n FROM messages")!.n,
      conversations: get<{ n: number }>("SELECT COUNT(*) AS n FROM conversations")!.n,
      channels: get<{ n: number }>("SELECT COUNT(*) AS n FROM conversations WHERE kind = 'channel'")!.n,
      communities: get<{ n: number }>("SELECT COUNT(*) AS n FROM communities")!.n,
      live: get<{ n: number }>("SELECT COUNT(*) AS n FROM live_streams WHERE status = 'live'")!.n,
    },
    users: all<{ id: number; username: string; name: string; phone: string | null; verified: number; created_at: number }>(
      "SELECT id, username, name, phone, verified, created_at FROM users ORDER BY id DESC LIMIT 30",
    ),
    posts: all<{ id: number; username: string; caption: string; type: string; created_at: number }>(
      `SELECT p.id, u.username, p.caption, p.type, p.created_at
       FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 30`,
    ),
  };
});
