// Права участников группы (server/lib/chatPermissions.js): по умолчанию всё разрешено,
// владельцы, админы и модераторы не ограничены. Копия в server/ остаётся для сообщений,
// постов и Bot API, пока они там: правка идёт в обе.

export const PERMISSIONS = [
  { id: "sendMessages", label: "Отправлять сообщения" },
  { id: "sendMedia", label: "Отправлять фото и файлы" },
  { id: "sendStickers", label: "Отправлять стикеры и подарки" },
  { id: "sendPolls", label: "Создавать опросы" },
  { id: "addMembers", label: "Добавлять участников" },
  { id: "pinMessages", label: "Закреплять сообщения" },
  { id: "createTopics", label: "Создавать темы" },
  { id: "setOwnTag", label: "Ставить себе тег" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["id"];

interface WithPermissions {
  type: string;
  permissions?: Record<string, boolean> | null;
  ownerId?: string;
  ownerIds?: string[];
  adminIds?: string[];
  moderatorIds?: string[];
}

const DEFAULTS = Object.fromEntries(PERMISSIONS.map((p) => [p.id, true])) as Record<Permission, boolean>;

export function permissionsOf(chat: Pick<WithPermissions, "permissions"> | undefined): Record<string, boolean> {
  return { ...DEFAULTS, ...(chat?.permissions ?? {}) };
}

/** Права из тела запроса: false — запрещено, всё прочее — разрешено; не объект — сброс (null). */
export function sanitizePermissions(raw: unknown): Record<Permission, boolean> | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out = {} as Record<Permission, boolean>;
  for (const p of PERMISSIONS) out[p.id] = source[p.id] !== false;
  return out;
}

function isStaff(chat: WithPermissions, userId: string): boolean {
  return (
    chat.ownerId === userId ||
    (chat.ownerIds ?? []).includes(userId) ||
    (chat.adminIds ?? []).includes(userId) ||
    (chat.moderatorIds ?? []).includes(userId)
  );
}

export function can(chat: WithPermissions | undefined, userId: string, what: Permission): boolean {
  if (!chat || chat.type !== "group") return true;
  if (isStaff(chat, userId)) return true;
  return permissionsOf(chat)[what] !== false;
}
