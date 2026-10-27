import { textCrypto, type Attachment } from "../../../legacy/legacy.js";
import type { Message, MessageRow, Reaction } from "../model/domain.js";

// Строка messages → сообщение, поле в поле как rowToMessage в server/data/messages.js, и
// обратно: шифрование текста и расшифровок голосовых. Оба бэкенда читают и пишут одну
// таблицу (message.mapper.spec.ts сверяет их). undefined — ключа нет в JSON-ответе.

/** Обёрнутый ключ секретного чата или null, если чат не секретный. */
export type SecretKeyOf = (chatId: string) => string | null;

// Повреждённый JSON в колонке не валит запрос: подставляется запасное значение.
function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (val === null || val === undefined || val === "") return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

// Секретный чат: текст дополнительно шифруется ключом чата, снаружи — как обычно, общим
// ключом сообщений.
export function sealText(chatId: string, id: string, text: string | null | undefined, secretKeyOf: SecretKeyOf): string {
  const crypto = textCrypto();
  const wrapped = secretKeyOf(chatId);
  return crypto.encryptText(id, wrapped ? crypto.sealSecret(chatId, wrapped, id, text) : text);
}

// Кэш расшифрованных текстов, как в server/data/messages.js: ключ — сам шифротекст вместе
// с id, поэтому правка, ротация ключа или перешифровка просто дают новую запись. Самая
// старая запись вытесняется первой.
const OPEN_CACHE_MAX = 20_000;
const OPEN_CACHE_MAX_LEN = 4096;
const openCache = new Map<string, string>();

export function openText(chatId: string, id: string, stored: string | null | undefined, secretKeyOf: SecretKeyOf): string {
  const crypto = textCrypto();
  if (!stored || !crypto.isEncrypted(stored)) return crypto.decryptText(id, stored);
  const cacheKey = `${chatId}\u0000${id}\u0000${stored}`;
  const hit = openCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const inner = crypto.decryptText(id, stored);
  const plain = inner.startsWith("sec1:") ? crypto.openSecret(chatId, secretKeyOf(chatId), id, inner) : inner;
  if (stored.length <= OPEN_CACHE_MAX_LEN && !plain.startsWith("⚠️")) {
    if (openCache.size >= OPEN_CACHE_MAX) openCache.delete(openCache.keys().next().value!);
    openCache.set(cacheKey, plain);
  }
  return plain;
}

// Расшифровка голосового — такой же текст переписки: в базе она шифруется наравне с текстом.
export function sealAttachments(chatId: string, id: string, attachments: Attachment[] | undefined, secretKeyOf: SecretKeyOf): string | null {
  if (!attachments) return null;
  return JSON.stringify(
    attachments.map((a) => (a?.transcript ? { ...a, transcript: sealText(chatId, `${id}:transcript`, a.transcript, secretKeyOf) } : a))
  );
}

function openAttachments(chatId: string, id: string, stored: string | null, secretKeyOf: SecretKeyOf): Attachment[] | undefined {
  if (!stored) return undefined;
  try {
    return (JSON.parse(stored) as Attachment[]).map((a) =>
      a?.transcript ? { ...a, transcript: openText(chatId, `${id}:transcript`, a.transcript, secretKeyOf) } : a
    );
  } catch {
    return undefined;
  }
}

export function toMessage(row: MessageRow, secretKeyOf: SecretKeyOf): Message {
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    type: row.type,
    text: openText(row.chatId, row.id, row.text, secretKeyOf),
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? undefined,
    pinned: !!row.pinned,
    replyToId: row.replyToId ?? null,
    forwardedFrom: safeParse<Message["forwardedFrom"]>(row.forwardedFrom, undefined),
    attachments: openAttachments(row.chatId, row.id, row.attachments, secretKeyOf),
    keyboard: safeParse<unknown>(row.keyboard, undefined),
    gift: safeParse<Message["gift"]>(row.gift, undefined),
    sticker: safeParse<Message["sticker"]>(row.sticker, undefined),
    customEmoji: safeParse<unknown>(row.customEmoji, undefined),
    linkPreview: safeParse<unknown>(row.linkPreview, undefined),
    report: safeParse<unknown>(row.report, undefined),
    reactions: safeParse<Reaction[]>(row.reactions, []),
    readByIds: safeParse<string[]>(row.readByIds, []),
    deletedForIds: safeParse<string[]>(row.deletedForIds, []),
    mentionedUserIds: safeParse<string[]>(row.mentionedUserIds, []),
    threadRootId: row.threadRootId ?? undefined,
    topicId: row.topicId ?? undefined,
    readAt: row.readAt ?? undefined,
    effect: row.effect ?? undefined,
    visibleToId: row.visibleToId ?? undefined,
    storyReply: safeParse<unknown>(row.storyReply, undefined),
    anchorForPostId: row.anchorForPostId ?? undefined,
    discussionAnchorId: row.discussionAnchorId ?? undefined,
    signedBy: row.signedBy ?? undefined,
    anonymous: !!row.anonymous || undefined,
    boostedUntil: row.boostedUntil ?? undefined,
    paidStars: row.paidStars || undefined,
    boostedById: row.boostedById ?? undefined,
    views: row.views,
    commentCount: row.commentCount || undefined,
  };
}
