import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { pushConfigured, vapidPublicKey } from "@/lib/server/push";

export const GET = route(async () => { await requireUser(); return { configured: pushConfigured, publicKey: vapidPublicKey() }; });
