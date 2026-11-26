import { route, intParam, jsonBody, HttpError } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { updateChatSettings, updateConversationTheme } from "@/lib/server/dm";

const THEMES = new Set(["default", "midnight", "sunset", "forest", "ocean"]);
const WALLPAPERS = new Set(["default", "dots", "stars", "waves", "sunset"]);

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const body = await jsonBody<{ theme?: string; wallpaper?: string; muted?: boolean }>(req);
  const conversationId = intParam((await params).id);
  if (body.theme !== undefined) {
    const theme = String(body.theme);
    if (!THEMES.has(theme)) throw new HttpError(400, "Unknown chat theme.");
    updateConversationTheme(conversationId, me.id, theme);
  }
  if (body.wallpaper !== undefined || body.muted !== undefined) {
    const wallpaper = body.wallpaper === undefined ? undefined : String(body.wallpaper);
    if (wallpaper !== undefined && !WALLPAPERS.has(wallpaper)) throw new HttpError(400, "Unknown chat wallpaper.");
    return updateChatSettings(conversationId, me.id, { wallpaper, mutedUntil: body.muted === undefined ? undefined : (body.muted ? Date.now() + 8 * 60 * 60 * 1000 : null) });
  }
  return { ok: true };
});
