// Ответы админки: server/routes/admin.js (/api/admin). Карточки пользователей
// собираются вручную (userLabel, decorateReport), а не через publicUser — поэтому
// у них свой строгий набор полей.
import { z } from "zod";
import { genId, isoDate } from "./common";
import { chat } from "./chat";

export const ADMIN_SECTIONS = ["moderation", "server", "giftshop", "emojicatalog", "donations", "pricing", "legal"] as const;
export const adminSection = z.enum(ADMIN_SECTIONS);

/** GET /lookup */
export const lookupBody = z.strictObject({
  user: z.strictObject({
    id: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
});

const ownerRef = z.strictObject({ id: z.string(), name: z.string(), username: z.string().nullable() }).nullable();

/** GET /chats/lookup — группа, канал или бот (как аккаунт). */
export const chatLookupBody = z.strictObject({
  chat: z.strictObject({
    id: z.string(),
    type: z.enum(["group", "channel", "bot"]),
    title: z.string(),
    username: z.string().nullable(),
    members: z.number().int(),
    owner: ownerRef,
  }),
});

/** userLabel(u) — карточка пользователя в модерации. */
const userLabelShape = {
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  safetyLabel: z.string().nullable(),
  isBanned: z.boolean(),
  isVerified: z.boolean(),
  isPremium: z.boolean(),
  premiumUntil: isoDate.nullable(),
  premiumForever: z.boolean(),
  isBusiness: z.boolean(),
  businessUntil: isoDate.nullable(),
  businessForever: z.boolean(),
  isAdsActive: z.boolean(),
  adsUntil: isoDate.nullable(),
  adsForever: z.boolean(),
  adminSections: z.array(z.string()),
  isDeveloper: z.literal(true).optional(),
};
export const userLabel = z.strictObject(userLabelShape);
/** userLabel для удалённого аккаунта. */
export const deletedUserLabel = z.strictObject({ id: z.string(), name: z.literal("(удалённый аккаунт)") });

export const bannedUserLabel = z.strictObject({ ...userLabelShape, bannedAt: isoDate.nullable(), banReason: z.string().nullable() });
export const labeledUserLabel = z.strictObject({ ...userLabelShape, safetyLabelAt: isoDate.nullable() });

/** Жалоба в модерации — decorateReport. */
export const decoratedReport = z.strictObject({
  id: genId("rp"),
  at: isoDate,
  status: z.enum(["open", "dismissed", "resolved_deleted", "resolved_banned"]),
  reason: z.string(),
  reasonLabel: z.string(),
  details: z.string().nullable(),
  targetType: z.enum(["user", "chat", "message"]),
  quoted: z.string().nullable(),
  reporter: userLabel.or(deletedUserLabel),
  subject: userLabel.or(deletedUserLabel).nullable(),
});

/** Метка безопасности: строка safety_labels. */
export const safetyLabel = z.strictObject({
  id: z.string(),
  short: z.string(),
  label: z.string(),
  hint: z.string(),
  color: z.string(),
  createdAt: isoDate,
});

/** Статус профиля из каталога: строка profile_statuses. */
export const statusCatalogItem = z.strictObject({
  id: z.string().regex(/^st_[a-z0-9]+_[a-z0-9]+$/),
  image: z.string(),
  name: z.string(),
  createdAt: isoDate,
});

/** GET /moderation */
export const moderationBody = z.strictObject({
  openReports: z.array(decoratedReport),
  banned: z.array(bannedUserLabel),
  labeled: z.array(labeledUserLabel),
  labels: z.array(safetyLabel),
  statusCatalog: z.array(statusCatalogItem),
});

/** GET /users/:id/reports */
export const userReportsBody = z.strictObject({ user: bannedUserLabel, reports: z.array(decoratedReport) });

export const banBody = z.strictObject({ user: bannedUserLabel });
export const labelUserBody = z.strictObject({ user: labeledUserLabel });
export const verifyUserBody = z.strictObject({ user: z.strictObject({ ...userLabelShape, isVerified: z.boolean() }) });
export const developerBody = z.strictObject({ user: userLabel });

export const labelBody = z.strictObject({ label: safetyLabel });
export const labelsBody = z.strictObject({ labels: z.array(safetyLabel) });
export const catalogItemBody = z.strictObject({ item: statusCatalogItem });

/** POST /chats/:id/verify — сырой rowToChat. */
export const chatVerifyBody = z.strictObject({ chat });

export const deleteUserBody = z.strictObject({
  ok: z.literal(true),
  deleted: z.strictObject({ id: z.string(), name: z.string(), username: z.string().nullable() }),
});
export const resetPasswordBody = z.strictObject({ ok: z.literal(true), twoFactorLifted: z.boolean() });

const deletedItem = z.strictObject({ id: z.string(), kind: z.enum(["group", "channel", "bot"]), title: z.string() });
export const bulkDeleteBody = z.strictObject({
  deleted: z.array(deletedItem),
  failed: z.array(z.strictObject({ id: z.string(), error: z.string() })),
});

export const adminSectionsBody = z.strictObject({ user: z.strictObject({ id: z.string(), adminSections: z.array(z.string()) }) });

/** GET /directory */
export const directoryUserItem = z.strictObject({
  kind: z.enum(["user", "bot"]),
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isBanned: z.boolean(),
  isSystem: z.boolean(),
});
export const directoryChatItem = z.strictObject({
  kind: z.enum(["group", "channel"]),
  id: z.string(),
  title: z.string(),
  username: z.string().nullable(),
  members: z.number().int(),
  isVerified: z.boolean(),
});
export const directoryUsersBody = z.strictObject({ items: z.array(directoryUserItem), total: z.number().int() });
export const directoryChatsBody = z.strictObject({ items: z.array(directoryChatItem), total: z.number().int() });

// ——— Цены (server/data/pricing.js) ———
const plan = z.strictObject({ id: z.string(), days: z.number().int(), priceRub: z.number().int(), label: z.string() });
const starPack = z.strictObject({ id: z.string(), stars: z.number().int(), priceRub: z.number().int() });
export const pricing = z.strictObject({
  premiumPlans: z.array(plan),
  businessPlans: z.array(plan),
  starPacks: z.array(starPack),
  ads: z.strictObject({ priceRub: z.number().int(), days: z.number().int() }),
  rubPerStar: z.number(),
  starCosts: z.strictObject({ boost: z.number().int(), delete: z.number().int() }),
});
export const pricingBody = z.strictObject({ pricing });
export const pricingWithDefaultsBody = z.strictObject({ pricing, defaults: pricing });

// ——— Юридический отдел (server/data/dataExport.js) ———
const exportUserRef = z.strictObject({
  id: z.string(),
  name: z.string().optional(),
  username: z.string().optional(),
  phone: z.string().optional(),
});
const exportAttachment = z.strictObject({
  kind: z.string(),
  name: z.string().optional(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  durationSec: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  url: z.string().optional(),
});
const exportMessage = z.strictObject({
  id: z.string(),
  at: isoDate,
  from: exportUserRef,
  sentByTarget: z.literal(true).optional(),
  type: z.string(),
  text: z.string().nullable(),
  encrypted: z.literal(true).optional(),
  ciphertext: z.string().optional(),
  editedAt: isoDate.optional(),
  replyToId: z.string().optional(),
  attachments: z.array(exportAttachment).optional(),
});
const exportMedia = z.strictObject({
  chatId: z.string(),
  chatType: z.string(),
  chatTitle: z.string().optional(),
  messageId: z.string(),
  at: isoDate,
  from: exportUserRef,
  sentByTarget: z.boolean(),
  kind: z.string(),
  name: z.string().optional(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  durationSec: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  url: z.string(),
  downloadUrl: z.string().regex(/^\/api\/admin\/export\/media\//),
});
export const userExport = z.strictObject({
  export: z.strictObject({ kind: z.literal("lawful-request-user-export"), generatedAt: isoDate, note: z.string() }),
  target: z.strictObject({
    id: z.string(),
    name: z.string(),
    username: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    createdAtFirstSeen: isoDate.optional(),
  }),
  stats: z.strictObject({
    chatCount: z.number().int(),
    messageCount: z.number().int(),
    sentMessageCount: z.number().int(),
    mediaCount: z.number().int(),
    byKind: z.record(z.string(), z.number().int()),
  }),
  chats: z.array(
    z.strictObject({
      chatId: z.string(),
      type: z.string(),
      title: z.string().optional(),
      members: z.array(exportUserRef),
      messageCount: z.number().int(),
      messages: z.array(exportMessage),
    })
  ),
  media: z.array(exportMedia),
});
export const exportBody = z.strictObject({ exportId: genId("exp"), data: userExport });

export const exportLogEntry = z.strictObject({
  id: genId("exp"),
  at: isoDate,
  reason: z.string(),
  messageCount: z.number().int(),
  admin: z.strictObject({ id: z.string(), name: z.string() }).or(z.strictObject({ id: z.string() })),
  target: z.strictObject({ id: z.string(), name: z.string(), username: z.string().nullable() }).or(z.strictObject({ id: z.string() })),
});
export const exportsBody = z.strictObject({ exports: z.array(exportLogEntry) });

// ——— Сервер (server/lib/serverStats.js, mailDns.js) ———
const num = z.number();
export const serverStatsBody = z.strictObject({
  at: isoDate,
  host: z.strictObject({
    hostname: z.string(),
    platform: z.string(),
    arch: z.string(),
    node: z.string(),
    uptimeSec: num,
    cpuModel: z.string(),
    cores: num,
  }),
  cpu: z.strictObject({ usagePercent: num, perCore: z.array(num), windowMs: num, loadAvg: z.array(num).nullable() }),
  memory: z.strictObject({ total: num, free: num, used: num, usedPercent: num }),
  disk: z
    .strictObject({ path: z.string(), total: num, free: num, used: num, usedPercent: num })
    .or(z.strictObject({ path: z.string(), error: z.string() })),
  process: z.strictObject({
    pid: num,
    uptimeSec: num,
    rss: num,
    heapUsed: num,
    heapTotal: num,
    external: num,
    sharePercent: num,
  }),
  storage: z.strictObject({
    db: num,
    wal: num,
    shm: num,
    uploads: num,
    uploadFiles: num,
    uploadsTruncated: z.boolean(),
    uploadsInS3: z.boolean(),
    total: num,
  }),
  db: z.strictObject({
    pageSize: num,
    pageCount: num,
    freeBytes: num,
    tables: z.array(z.strictObject({ name: z.string(), rows: num })),
    totalRows: num,
  }),
  realtime: z.strictObject({ onlineUsers: num, sockets: num }),
});

const dnsRecord = z.strictObject({
  kind: z.enum(["SPF", "DKIM", "DMARC"]),
  name: z.string(),
  value: z.string(),
  current: z.string().nullable(),
  published: z.boolean(),
  note: z.string(),
});
export const mailStatusBody = z.strictObject({
  from: z.string(),
  configured: z.boolean(),
  ok: z.boolean(),
  error: z.string().nullable(),
  directEnabled: z.boolean(),
  dns: z.strictObject({ domain: z.string().nullable(), ip: z.string().nullable(), records: z.array(dnsRecord) }),
});
