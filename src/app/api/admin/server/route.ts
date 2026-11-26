import { route } from "@/lib/server/http";
import { get } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/admin";
import { mailConfigured } from "@/lib/server/mailer";
import { pushConfigured } from "@/lib/server/push";

export const GET = route(async () => {
  await requireAdmin();
  return {
    status: "ok",
    node: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV ?? "development",
    database: {
      users: get<{ n: number }>("SELECT COUNT(*) AS n FROM users")!.n,
      conversations: get<{ n: number }>("SELECT COUNT(*) AS n FROM conversations")!.n,
      media: get<{ n: number }>("SELECT COUNT(*) AS n FROM post_media")!.n,
    },
    integrations: { smtp: mailConfigured, push: pushConfigured },
  };
});
