import crypto from "node:crypto";
import { route, jsonBody, HttpError } from "@/lib/server/http";
import { get } from "@/lib/server/db";
import { sendMessage } from "@/lib/server/dm";

export const POST = route(async (req) => {
  const body = await jsonBody<{ token?: string; conversationId?: number; text?: string }>(req);
  const token = String(body.token ?? "");
  const conversationId = Number(body.conversationId);
  const text = String(body.text ?? "").trim().slice(0, 1000);
  if (!token || !Number.isInteger(conversationId) || !text) throw new HttpError(400, "token, conversationId and text are required.");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const bot = get<{ id: number; user_id: number; active: number }>("SELECT id, user_id, active FROM bots WHERE token_hash = ?", hash);
  if (!bot || !bot.active) throw new HttpError(401, "Invalid bot token.");
  if (!get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, bot.user_id)) throw new HttpError(403, "Add this bot to the conversation first.");
  const command = text.split(/\s+/)[0].toLowerCase();
  const response = get<{ response: string }>("SELECT response FROM bot_commands WHERE bot_id = ? AND command = ?", bot.id, command)?.response;
  if (!response) return { ok: true, replied: false };
  const messageId = sendMessage(conversationId, bot.user_id, response);
  return { ok: true, replied: true, messageId };
});
