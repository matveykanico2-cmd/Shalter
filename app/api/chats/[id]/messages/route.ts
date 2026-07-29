import { NextResponse } from "next/server";
import { requireUserId, isResponse } from "@/lib/api-helpers";
import { getChat } from "@/lib/data/chats";
import { listMessages, addMessage } from "@/lib/data/messages";
import { getBotByUserId } from "@/lib/data/bots";
import { getUser } from "@/lib/data/users";
import type { Message } from "@/lib/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/chats/[id]/messages">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const messages = await listMessages(id);
  return NextResponse.json({ messages });
}

export async function POST(request: Request, ctx: RouteContext<"/api/chats/[id]/messages">) {
  const uid = await requireUserId();
  if (isResponse(uid)) return uid;
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat || !chat.memberIds.includes(uid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    text: string;
    replyToId?: string | null;
    attachments?: Message["attachments"];
    forwardedFrom?: Message["forwardedFrom"];
  };
  if (!body.text?.trim() && !body.attachments?.length) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  if (chat.type === "dm") {
    const otherId = chat.memberIds.find((m) => m !== uid);
    const other = otherId ? await getUser(otherId) : undefined;
    if (other?.blockedUserIds?.includes(uid)) {
      return NextResponse.json({ error: "Пользователь заблокировал вас" }, { status: 403 });
    }
  }

  const message = await addMessage({
    id: `m_${Date.now()}`,
    chatId: id,
    senderId: uid,
    type: "text",
    text: body.text ?? "",
    createdAt: new Date().toISOString(),
    pinned: false,
    reactions: [],
    replyToId: body.replyToId ?? null,
    attachments: body.attachments,
    forwardedFrom: body.forwardedFrom,
    readByIds: [uid],
  } satisfies Message);

  // Bot chats auto-reply so the composer + inline-keyboard flow is testable end to end.
  const botMemberId = chat.memberIds.find((m) => m !== uid);
  const bot = botMemberId ? await getBotByUserId(botMemberId) : undefined;
  if (bot) {
    const city = body.text.replace(/^\/weather\s*/i, "").trim() || "Москва";
    await addMessage({
      id: `m_${Date.now() + 1}`,
      chatId: id,
      senderId: bot.userId,
      type: "text",
      text: `${city}: +${18 + (city.length % 10)}°C, переменная облачность`,
      createdAt: new Date().toISOString(),
      pinned: false,
      reactions: [],
      readByIds: [],
      keyboard: [[{ text: "Обновить", action: `/weather ${city}` }, { text: "Другой город", action: "/weather" }]],
    } satisfies Message);
  }

  return NextResponse.json({ message });
}
