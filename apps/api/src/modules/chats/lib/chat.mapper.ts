import type { ChatMemberRow, ChatRow } from "../model/domain.js";

// Строка chats + участники → чат, поле в поле как rowToChat в server/data/chats.js: оба
// бэкенда отдают один и тот же чат (chat.mapper.spec.ts сверяет их). undefined — ключа нет
// в JSON-ответе.

// Повреждённый JSON в колонке не валит запрос: подставляется запасное значение.
function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (val === null || val === undefined || val === "") return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export type ChatMember = Pick<ChatMemberRow, "userId" | "isAdmin" | "isModerator" | "isOwner">;
export type ChatType = "dm" | "group" | "channel" | "bot";
/** Срок ограничения участника: ISO-время или "forever". */
export type Restrictions = Record<string, string>;

export function toChat(row: ChatRow, members: ChatMember[]) {
  return {
    id: row.id,
    type: row.type as ChatType,
    title: row.title,
    description: row.description ?? undefined,
    username: row.username ?? undefined,
    isPublic: !!row.isPublic || undefined,
    isVerified: !!row.isVerified || undefined,
    inviteCode: row.inviteCode ?? undefined,
    approveJoins: !!row.approveJoins || undefined,
    signMessages: !!row.signMessages || undefined,
    // Всегда true/false, не undefined: открытый канал сливает обновление поверх старого
    // объекта, и пропавшее из JSON поле оставило бы комментарии выключенными.
    commentsOff: !!row.commentsOff,
    anonymousAdmins: !!row.anonymousAdmins || undefined,
    permissions: safeParse<Record<string, boolean> | null>(row.permissions, null),
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    ownerId: row.ownerId ?? undefined,
    adminIds: members.filter((m) => m.isAdmin).map((m) => m.userId),
    moderatorIds: members.filter((m) => m.isModerator).map((m) => m.userId),
    ownerIds: members.filter((m) => m.isOwner).map((m) => m.userId),
    memberTitles: safeParse<Record<string, string>>(row.memberTitles, {}),
    memberIds: members.map((m) => m.userId),
    membersCount: members.length,
    pinned: !!row.pinned,
    muted: !!row.muted || (!!row.mutedUntil && row.mutedUntil > new Date().toISOString()),
    mutedUntil: row.mutedUntil ?? undefined,
    slowModeSeconds: row.slowModeSeconds ?? undefined,
    commentPriceStars: row.commentPriceStars ?? 0,
    archived: !!row.archived,
    createdAt: row.createdAt,
    linkedDiscussionChatId: row.linkedDiscussionChatId ?? undefined,
    wallpaper: safeParse<unknown>(row.wallpaper, null),
    allowedReactions: safeParse<string[] | null>(row.allowedReactions, null),
    restrictions: safeParse<Restrictions>(row.restrictions, {}),
    warnings: safeParse<Record<string, unknown>>(row.warnings, {}),
    bannedIds: safeParse<string[]>(row.bannedIds, []),
    rules: row.rules ?? undefined,
    topicsEnabled: !!row.topicsEnabled || undefined,
    welcomeText: row.welcomeText ?? undefined,
    protectedBy: safeParse<string[]>(row.protectedBy, []),
    points: row.points ?? 0,
    votes: safeParse<Record<string, string>>(row.votes, {}),
    autoDeleteSeconds: row.autoDeleteSeconds ?? undefined,
    // Ни ключ, ни привязку к устройствам наружу не отдаём: device_id — часть
    // авторизации, а ключ нужен только сообщениям (server/data/messages.js).
    secret: !!row.secret || undefined,
  };
}
