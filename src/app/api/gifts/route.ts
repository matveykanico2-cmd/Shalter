import { route } from "@/lib/server/http";
import { all } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

export const GET = route(async () => {
  await requireUser();
  return { gifts: all<{ id: number; name: string; emoji: string; price: number }>("SELECT id, name, emoji, price FROM gift_catalog WHERE active = 1 ORDER BY price, id") };
});
