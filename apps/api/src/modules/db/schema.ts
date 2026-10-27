// Схема базы для Drizzle — описание таблиц, которые создаёт и меняет server/db.js.
// Схемой владеет server/db.js: здесь только колонки и первичные ключи, без индексов
// и проверок, и drizzle-kit generate/migrate/push не запускаются. Снято с базы командой
// `npx drizzle-kit pull` (drizzle.config.ts); расхождение с server/db.js ловит
// schema.spec.ts. Поисковый указатель FTS5 (messages_search) сюда не входит.
//
// Флаги — INTEGER 0/1, JSON-поля — TEXT, даты — ISO-строки в TEXT, как в server/data/*.js;
// преобразование в boolean/объекты — забота репозиториев.
import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text().primaryKey(),
  name: text().default("").notNull(),
  username: text().default("").notNull(),
  phone: text().default("").notNull(),
  email: text(),
  passwordHash: text(),
  passwordSalt: text(),
  avatarColor: text(),
  avatarImage: text(),
  bio: text().default("").notNull(),
  online: integer().default(0).notNull(),
  lastSeen: text(),
  isBot: integer().default(0).notNull(),
  isGuest: integer().default(0).notNull(),
  blockedUserIds: text().default("[]").notNull(),
  isPremium: integer().default(0).notNull(),
  referralCode: text(),
  referredBy: text(),
  lastName: text(),
  premiumUntil: text(),
  scheduledDeletionAt: text(),
  adsUntil: text(),
  adText: text(),
  adUrl: text(),
  businessUntil: text(),
  businessAddress: text(),
  businessLat: real(),
  nameColor: text(),
  profileBanner: text(),
  businessLng: real(),
  adAttachments: text(),
  birthday: text(),
  giftsReceived: text().default("[]").notNull(),
  isBanned: integer().default(0).notNull(),
  banReason: text(),
  bannedAt: text(),
  bannedUntil: text(),
  safetyLabel: text(),
  safetyLabelAt: text(),
  stars: integer().default(0).notNull(),
  messagePriceStars: integer().default(0).notNull(),
  statusItems: text().default("[]").notNull(),
  activeStatusId: text(),
  totpSecret: text(),
  totpEnabledAt: text(),
  totpRecoveryCodes: text(),
  developer: integer().default(0).notNull(),
  twoFactorMethod: text(),
  cloudPasswordHash: text(),
  cloudPasswordSalt: text(),
  cloudPasswordHint: text(),
  usernameAuctionId: text(),
  isVerified: integer().default(0).notNull(),
  avatarImages: text().default("[]").notNull(),
  nearbyLat: real(),
  nearbyLng: real(),
  nearbyUpdatedAt: text(),
  adminSections: text().default("[]").notNull(),
  profileTrack: text(),
});

export const chats = sqliteTable("chats", {
  id: text().primaryKey(),
  type: text().notNull(),
  title: text().default("").notNull(),
  description: text(),
  username: text(),
  isPublic: integer().default(0).notNull(),
  avatarColor: text(),
  avatarImage: text(),
  ownerId: text(),
  pinned: integer().default(0).notNull(),
  muted: integer().default(0).notNull(),
  archived: integer().default(0).notNull(),
  createdAt: text().notNull(),
  linkedDiscussionChatId: text(),
  isVerified: integer().default(0).notNull(),
  mutedUntil: text(),
  slowModeSeconds: integer(),
  commentPriceStars: integer().default(0).notNull(),
  permissions: text(),
  approveJoins: integer().default(0).notNull(),
  signMessages: integer().default(0).notNull(),
  commentsOff: integer().default(0).notNull(),
  anonymousAdmins: integer().default(0).notNull(),
  inviteCode: text(),
  wallpaper: text(),
  allowedReactions: text(),
  memberTitles: text(),
  restrictions: text(),
  points: integer().default(0).notNull(),
  votes: text(),
  autoDeleteSeconds: integer(),
  warnings: text(),
  rules: text(),
  bannedIds: text(),
  topicsEnabled: integer().default(0).notNull(),
  welcomeText: text(),
  protectedBy: text(),
  secret: integer().default(0).notNull(),
  secretKey: text(),
  secretDevices: text(),
});

export const chatMembers = sqliteTable("chat_members", {
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  isAdmin: integer().default(0).notNull(),
  isModerator: integer().default(0).notNull(),
  isOwner: integer().default(0).notNull(),
},
(table) => [
  primaryKey({ columns: [table.chatId, table.userId], name: "chat_members_chatId_userId_pk" }),
]);

export const messages = sqliteTable("messages", {
  id: text().primaryKey(),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  senderId: text().notNull(),
  type: text().default("text").notNull(),
  text: text().default("").notNull(),
  createdAt: text().notNull(),
  editedAt: text(),
  pinned: integer().default(0).notNull(),
  replyToId: text(),
  forwardedFrom: text(),
  attachments: text(),
  keyboard: text(),
  reactions: text().default("[]").notNull(),
  readByIds: text().default("[]").notNull(),
  deletedForIds: text().default("[]").notNull(),
  anchorForPostId: text(),
  discussionAnchorId: text(),
  views: integer().default(0).notNull(),
  commentCount: integer().default(0).notNull(),
  signedBy: text(),
  boostedUntil: text(),
  boostedById: text(),
  customEmoji: text(),
  gift: text(),
  paidStars: integer().default(0).notNull(),
  anonymous: integer().default(0).notNull(),
  sticker: text(),
  linkPreview: text(),
  report: text(),
  mentionedUserIds: text().default("[]").notNull(),
  threadRootId: text(),
  storyReply: text(),
  hasLink: integer().default(0).notNull(),
  topicId: text(),
  readAt: text(),
  readTimes: text(),
  effect: text(),
  visibleToId: text(),
});

export const contacts = sqliteTable("contacts", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  userId: text().notNull(),
  addedAt: text().notNull(),
  localName: text(),
  note: text(),
});

export const folders = sqliteTable("folders", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  name: text().notNull(),
  sortOrder: integer().default(0).notNull(),
  chatIds: text().default("[]").notNull(),
  inviteCode: text(),
});

export const calls = sqliteTable("calls", {
  id: text().primaryKey(),
  chatId: text().notNull(),
  kind: text().notNull(),
  direction: text(),
  callerId: text().notNull(),
  status: text().notNull(),
  startedAt: text().notNull(),
  durationSec: integer().default(0).notNull(),
  joinToken: text(),
});

export const callParticipants = sqliteTable("call_participants", {
  callId: text().notNull().references(() => calls.id, { onDelete: "cascade" }),
  userId: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.callId, table.userId], name: "call_participants_callId_userId_pk" }),
]);

export const signals = sqliteTable("signals", {
  id: text().primaryKey(),
  seq: integer().notNull(),
  callId: text().notNull(),
  fromUserId: text().notNull(),
  toUserId: text().notNull(),
  kind: text().notNull(),
  data: text(),
  createdAt: text().notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userId: text().notNull(),
  deviceId: text().notNull(),
  device: text(),
  location: text(),
  lastActive: text().notNull(),
  revokedAt: text(),
});

export const settings = sqliteTable("settings", {
  userId: text().primaryKey(),
  data: text().notNull(),
});

export const bots = sqliteTable("bots", {
  id: text().primaryKey(),
  userId: text().notNull(),
  ownerId: text(),
  token: text(),
  description: text(),
  commands: text().default("[]").notNull(),
  createdAt: text(),
  code: text(),
  appUrl: text(),
  appName: text(),
  appCode: text(),
});

export const reports = sqliteTable("reports", {
  id: text().primaryKey(),
  reporterId: text().notNull(),
  targetType: text().notNull(),
  targetId: text().notNull(),
  reason: text().notNull(),
  details: text(),
  createdAt: text().notNull(),
  status: text().default("open").notNull(),
  subjectUserId: text(),
});

export const stories = sqliteTable("stories", {
  id: text().primaryKey(),
  userId: text().notNull(),
  kind: text().notNull(),
  url: text().notNull(),
  createdAt: text().notNull(),
  expiresAt: text().notNull(),
  viewedByIds: text().default("[]").notNull(),
  items: text(),
  likedByIds: text().default("[]").notNull(),
});

export const scheduledMessages = sqliteTable("scheduled_messages", {
  id: text().primaryKey(),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  senderId: text().notNull(),
  text: text().default("").notNull(),
  attachments: text(),
  replyToId: text(),
  sendAt: text().notNull(),
  createdAt: text().notNull(),
  repeat: text(),
  topicId: text(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text().primaryKey(),
  userId: text().notNull(),
  endpoint: text().notNull(),
  subscription: text().notNull(),
});

export const vapidKeys = sqliteTable("vapid_keys", {
  id: integer().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
});

export const chatReads = sqliteTable("chat_reads", {
  chatId: text().notNull(),
  userId: text().notNull(),
  lastReadAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.chatId, table.userId], name: "chat_reads_chatId_userId_pk" }),
]);

export const postViews = sqliteTable("post_views", {
  postId: text().notNull(),
  userId: text().notNull(),
  viewedAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.postId, table.userId], name: "post_views_postId_userId_pk" }),
]);

export const dkimKeys = sqliteTable("dkim_keys", {
  id: integer().primaryKey(),
  selector: text().notNull(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
});

export const donationAlertsAuth = sqliteTable("donation_alerts_auth", {
  id: integer().primaryKey(),
  accessToken: text(),
  refreshToken: text(),
  expiresAt: text(),
  username: text(),
  lastDonationId: integer().default(0).notNull(),
});

export const donatePayState = sqliteTable("donate_pay_state", {
  id: integer().primaryKey(),
  lastTransactionId: integer().default(0).notNull(),
});

export const pendingOrders = sqliteTable("pending_orders", {
  id: text().primaryKey(),
  code: text().notNull(),
  userId: text().notNull(),
  kind: text().notNull(),
  giftId: text(),
  recipientId: text(),
  amountRub: integer().notNull(),
  status: text().default("pending").notNull(),
  createdAt: text().notNull(),
  meta: text(),
});

export const appConfig = sqliteTable("app_config", {
  key: text().primaryKey(),
  data: text().notNull(),
});

export const oauthApps = sqliteTable("oauth_apps", {
  id: text().primaryKey(),
  name: text().notNull(),
  clientId: text().notNull(),
  clientSecret: text().notNull(),
  redirectUri: text().notNull(),
  ownerId: text().notNull(),
  createdAt: text().notNull(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  code: text().primaryKey(),
  clientId: text().notNull(),
  userId: text().notNull(),
  redirectUri: text().notNull(),
  expiresAt: text().notNull(),
  usedAt: text(),
});

export const oauthTokens = sqliteTable("oauth_tokens", {
  token: text().primaryKey(),
  clientId: text().notNull(),
  userId: text().notNull(),
  createdAt: text().notNull(),
});

export const birthdayGreetingsSent = sqliteTable("birthday_greetings_sent", {
  ownerId: text().notNull(),
  birthdayUserId: text().notNull(),
  year: integer().notNull(),
  sentAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.ownerId, table.birthdayUserId, table.year], name: "birthday_greetings_sent_ownerId_birthdayUserId_year_pk" }),
]);

export const holidayNotificationsSent = sqliteTable("holiday_notifications_sent", {
  userId: text().notNull(),
  holidayId: text().notNull(),
  year: integer().notNull(),
  sentAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.userId, table.holidayId, table.year], name: "holiday_notifications_sent_userId_holidayId_year_pk" }),
]);

export const businessAutoRepliesSent = sqliteTable("business_auto_replies_sent", {
  chatId: text().notNull(),
  kind: text().notNull(),
  sentDate: text().notNull(),
  sentAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.chatId, table.kind, table.sentDate], name: "business_auto_replies_sent_chatId_kind_sentDate_pk" }),
]);

export const giftIssues = sqliteTable("gift_issues", {
  id: text().primaryKey(),
  giftId: text().notNull(),
  serial: integer().notNull(),
  recipientId: text().notNull(),
  fromId: text(),
  issuedAt: text().notNull(),
});

export const stickerPacks = sqliteTable("sticker_packs", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  name: text().notNull(),
  stickers: text().default("[]").notNull(),
  createdAt: text().notNull(),
});

export const customEmoji = sqliteTable("custom_emoji", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  name: text().default("").notNull(),
  scene: text().notNull(),
  createdAt: text().notNull(),
});

export const giftCatalog = sqliteTable("gift_catalog", {
  id: text().primaryKey(),
  emoji: text(),
  name: text(),
  priceRub: integer(),
  priceStars: integer(),
  premiumDays: integer(),
  supply: integer(),
  exclusive: integer().default(0).notNull(),
  custom: integer().default(0).notNull(),
  mediaUrl: text(),
  createdAt: text().notNull(),
  hidden: integer().default(0).notNull(),
  scene: text(),
  ownerId: text(),
});

export const dataExports = sqliteTable("data_exports", {
  id: text().primaryKey(),
  adminId: text().notNull(),
  targetUserId: text().notNull(),
  reason: text().notNull(),
  messageCount: integer().default(0).notNull(),
  createdAt: text().notNull(),
});

export const storyComments = sqliteTable("story_comments", {
  id: text().primaryKey(),
  storyId: text().notNull().references(() => stories.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  text: text().notNull(),
  createdAt: text().notNull(),
  parentId: text(),
  likedByIds: text().default("[]").notNull(),
  editedAt: text(),
});

export const usernameAuctions = sqliteTable("username_auctions", {
  id: text().primaryKey(),
  username: text().notNull(),
  startPriceStars: integer().default(0).notNull(),
  bids: text().default("[]").notNull(),
  endsAt: text().notNull(),
  status: text().default("open").notNull(),
  winnerId: text(),
  soldForStars: integer(),
  createdAt: text().notNull(),
  settledAt: text(),
});

export const usernameListings = sqliteTable("username_listings", {
  id: text().primaryKey(),
  username: text().notNull(),
  sellerId: text().notNull(),
  priceStars: integer().notNull(),
  status: text().default("open").notNull(),
  buyerId: text(),
  soldAt: text(),
  createdAt: text().notNull(),
});

export const joinRequests = sqliteTable("join_requests", {
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  createdAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.chatId, table.userId], name: "join_requests_chatId_userId_pk" }),
]);

export const paidMedia = sqliteTable("paid_media", {
  messageId: text().primaryKey(),
  chatId: text().notNull(),
  stars: integer().notNull(),
  attachments: text().notNull(),
  createdAt: text().notNull(),
});

export const games = sqliteTable("games", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  title: text().notNull(),
  description: text().default("").notNull(),
  emoji: text().default("🎮").notNull(),
  code: text().notNull(),
  isPublic: integer().default(0).notNull(),
  plays: integer().default(0).notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const gameTokens = sqliteTable("game_tokens", {
  gameId: text().primaryKey(),
  tokenHash: text().notNull(),
  createdAt: text().notNull(),
});

export const gameScores = sqliteTable("game_scores", {
  gameId: text().notNull(),
  scope: text().default("").notNull(),
  userId: text().notNull(),
  score: integer().notNull(),
  updatedAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.gameId, table.scope, table.userId], name: "game_scores_gameId_scope_userId_pk" }),
]);

export const paidMediaBuyers = sqliteTable("paid_media_buyers", {
  messageId: text().notNull(),
  userId: text().notNull(),
  createdAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.messageId, table.userId], name: "paid_media_buyers_messageId_userId_pk" }),
]);

export const cryptoKeys = sqliteTable("crypto_keys", {
  id: integer().primaryKey({ autoIncrement: true }),
  purpose: text().notNull(),
  wrapped: text().notNull(),
  createdAt: text().notNull(),
});

export const liveStreams = sqliteTable("live_streams", {
  id: text().primaryKey(),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  hostId: text().notNull(),
  title: text().default("").notNull(),
  withVideo: integer().default(1).notNull(),
  status: text().default("live").notNull(),
  startedAt: text().notNull(),
  endedAt: text(),
  source: text().default("webrtc").notNull(),
  streamKey: text(),
  rtmpLive: integer().default(0).notNull(),
});

export const liveParticipants = sqliteTable("live_participants", {
  streamId: text().notNull().references(() => liveStreams.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  role: text().default("viewer").notNull(),
  handRaised: integer().default(0).notNull(),
  mutedByHost: integer().default(0).notNull(),
  joinedAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.streamId, table.userId], name: "live_participants_streamId_userId_pk" }),
]);

export const liveMessages = sqliteTable("live_messages", {
  id: text().primaryKey(),
  streamId: text().notNull().references(() => liveStreams.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  text: text().notNull(),
  createdAt: text().notNull(),
  editedAt: text(),
});

export const safetyLabels = sqliteTable("safety_labels", {
  id: text().primaryKey(),
  short: text().notNull(),
  label: text().notNull(),
  hint: text().default("").notNull(),
  color: text(),
  createdAt: text().notNull(),
});

export const profileStatuses = sqliteTable("profile_statuses", {
  id: text().primaryKey(),
  image: text().notNull(),
  name: text().default("").notNull(),
  createdAt: text().notNull(),
});

export const adCampaigns = sqliteTable("ad_campaigns", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  title: text().default("").notNull(),
  text: text().default("").notNull(),
  url: text(),
  imageUrl: text(),
  placement: text().default("discover").notNull(),
  status: text().default("draft").notNull(),
  rejectReason: text(),
  budgetStars: integer().default(0).notNull(),
  spentStars: integer().default(0).notNull(),
  cpmStars: integer().default(20).notNull(),
  impressions: integer().default(0).notNull(),
  clicks: integer().default(0).notNull(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export const adDaily = sqliteTable("ad_daily", {
  campaignId: text().notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  day: text().notNull(),
  impressions: integer().default(0).notNull(),
  clicks: integer().default(0).notNull(),
  spentStars: integer().default(0).notNull(),
},
(table) => [
  primaryKey({ columns: [table.campaignId, table.day], name: "ad_daily_campaignId_day_pk" }),
]);

export const shops = sqliteTable("shops", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  title: text().notNull(),
  about: text().default("").notNull(),
  imageUrl: text(),
  city: text().default("").notNull(),
  isOpen: integer().default(1).notNull(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export const shopProducts = sqliteTable("shop_products", {
  id: text().primaryKey(),
  shopId: text().notNull().references(() => shops.id, { onDelete: "cascade" }),
  title: text().notNull(),
  description: text().default("").notNull(),
  imageUrl: text(),
  payKind: text().default("stars").notNull(),
  priceStars: integer().default(0).notNull(),
  priceRub: integer().default(0).notNull(),
  stock: integer().default(-1).notNull(),
  isActive: integer().default(1).notNull(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export const shopOrders = sqliteTable("shop_orders", {
  id: text().primaryKey(),
  shopId: text().notNull(),
  productId: text().notNull(),
  productTitle: text().default("").notNull(),
  buyerId: text().notNull(),
  sellerId: text().notNull(),
  qty: integer().default(1).notNull(),
  payKind: text().default("stars").notNull(),
  amountStars: integer().default(0).notNull(),
  amountRub: integer().default(0).notNull(),
  status: text().default("new").notNull(),
  note: text().default("").notNull(),
  chatId: text(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export const listings = sqliteTable("listings", {
  id: text().primaryKey(),
  sellerId: text().notNull(),
  title: text().notNull(),
  description: text().default("").notNull(),
  category: text().default("other").notNull(),
  condition: text().default("used").notNull(),
  priceRub: integer().default(0).notNull(),
  isNegotiable: integer().default(0).notNull(),
  city: text().default("").notNull(),
  photos: text().default("[]").notNull(),
  cdekPriceRub: integer(),
  status: text().default("active").notNull(),
  views: integer().default(0).notNull(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export const listingFavorites = sqliteTable("listing_favorites", {
  userId: text().notNull(),
  listingId: text().notNull().references(() => listings.id, { onDelete: "cascade" }),
  createdAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.userId, table.listingId], name: "listing_favorites_userId_listingId_pk" }),
]);

export const uploadAccess = sqliteTable("upload_access", {
  filename: text().notNull(),
  chatId: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.filename, table.chatId], name: "upload_access_filename_chatId_pk" }),
]);

export const uploadUploaders = sqliteTable("upload_uploaders", {
  filename: text().notNull(),
  userId: text().notNull(),
  createdAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.filename, table.userId], name: "upload_uploaders_filename_userId_pk" }),
]);

export const uploadDeletions = sqliteTable("upload_deletions", {
  filename: text().primaryKey(),
  deletedAt: integer().notNull(),
});

export const backgroundJobs = sqliteTable("background_jobs", {
  id: integer().primaryKey({ autoIncrement: true }),
  kind: text().notNull(),
  payload: text().notNull(),
  runAt: integer().notNull(),
  attempts: integer().default(0).notNull(),
  lockedAt: integer(),
  createdAt: integer().notNull(),
});

export const shortLinks = sqliteTable("short_links", {
  code: text().primaryKey(),
  targetUrl: text().notNull(),
  creatorId: text().notNull(),
  createdAt: text().notNull(),
  clicks: integer().default(0).notNull(),
});

export const reminders = sqliteTable("reminders", {
  id: text().primaryKey(),
  userId: text().notNull(),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  text: text().notNull(),
  dueAt: text().notNull(),
  sent: integer().default(0).notNull(),
  createdAt: text().notNull(),
});

export const notes = sqliteTable("notes", {
  id: text().primaryKey(),
  userId: text().notNull(),
  text: text().notNull(),
  createdAt: text().notNull(),
});

export const dailyClaims = sqliteTable("daily_claims", {
  userId: text().primaryKey(),
  lastClaimAt: text().notNull(),
});

export const aiUsage = sqliteTable("ai_usage", {
  userId: text().notNull(),
  day: text().notNull(),
  texts: integer().default(0).notNull(),
  images: integer().default(0).notNull(),
},
(table) => [
  primaryKey({ columns: [table.userId, table.day], name: "ai_usage_userId_day_pk" }),
]);

export const chatTopics = sqliteTable("chat_topics", {
  id: text().primaryKey(),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  title: text().notNull(),
  icon: text(),
  color: text(),
  closed: integer().default(0).notNull(),
  createdBy: text().notNull(),
  createdAt: text().notNull(),
});

export const chatAdminLog = sqliteTable("chat_admin_log", {
  id: integer().primaryKey({ autoIncrement: true }),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  actorId: text().notNull(),
  action: text().notNull(),
  targetId: text(),
  details: text(),
  createdAt: text().notNull(),
});

export const passkeys = sqliteTable("passkeys", {
  id: text().primaryKey(),
  userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
  publicKey: text().notNull(),
  signCount: integer().default(0).notNull(),
  name: text(),
  createdAt: text().notNull(),
  lastUsedAt: text(),
});

export const translationCache = sqliteTable("translation_cache", {
  lang: text().notNull(),
  text: text().notNull(),
  translated: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.lang, table.text], name: "translation_cache_lang_text_pk" }),
]);

export const communities = sqliteTable("communities", {
  id: text().primaryKey(),
  ownerId: text().notNull(),
  title: text().notNull(),
  description: text(),
  avatarColor: text(),
  avatarImage: text(),
  addMode: text().default("all").notNull(),
  createdAt: text().notNull(),
});

export const communityChats = sqliteTable("community_chats", {
  chatId: text().primaryKey().references(() => chats.id, { onDelete: "cascade" }),
  communityId: text().notNull().references(() => communities.id, { onDelete: "cascade" }),
  visible: integer().default(1).notNull(),
  addedAt: text().notNull(),
  addedBy: text(),
});

export const communityMembers = sqliteTable("community_members", {
  communityId: text().notNull().references(() => communities.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  role: text().default("member").notNull(),
  rights: text(),
  badge: text(),
  title: text(),
  left: integer().default(0).notNull(),
  pinned: integer().default(0).notNull(),
  collapsed: integer().default(1).notNull(),
  joinedAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.communityId, table.userId], name: "community_members_communityId_userId_pk" }),
]);

export const communityBans = sqliteTable("community_bans", {
  communityId: text().notNull().references(() => communities.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  bannedBy: text(),
  bannedAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.communityId, table.userId], name: "community_bans_communityId_userId_pk" }),
]);

export const communityRequests = sqliteTable("community_requests", {
  id: text().primaryKey(),
  communityId: text().notNull().references(() => communities.id, { onDelete: "cascade" }),
  chatId: text().notNull().references(() => chats.id, { onDelete: "cascade" }),
  suggestedBy: text().notNull(),
  visible: integer().default(1).notNull(),
  createdAt: text().notNull(),
});

export const dataMigrations = sqliteTable("data_migrations", {
  name: text().primaryKey(),
  doneAt: text().notNull(),
});

export const promoCodes = sqliteTable("promo_codes", {
  id: text().primaryKey(),
  code: text().notNull(),
  prize: text().notNull(),
  config: text().notNull(),
  usesTotal: integer(),
  used: integer().default(0).notNull(),
  createdBy: text().notNull(),
  createdAt: text().notNull(),
});

export const promoCodeRedemptions = sqliteTable("promo_code_redemptions", {
  codeId: text().notNull().references(() => promoCodes.id, { onDelete: "cascade" }),
  userId: text().notNull(),
  redeemedAt: text().notNull(),
},
(table) => [
  primaryKey({ columns: [table.codeId, table.userId], name: "promo_code_redemptions_codeId_userId_pk" }),
]);
