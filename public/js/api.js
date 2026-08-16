async function req(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // This device's session was terminated from elsewhere (Settings →
    // Устройства → «Завершить», server/middleware/auth.js's requireUserId) —
    // bounce to login instead of leaving every subsequent request failing
    // silently. ?reason=revoked lets login.js show why, instead of it just
    // looking like a random logout.
    if (body.error === "session_revoked") window.location.href = "/login?reason=revoked";
    // Banned by the admin (routes/reports.js's /:id/resolve or Settings →
    // Модерация) — same "bounce to login with an explanation" shape as above,
    // carrying the recorded reason so the login screen can show it.
    if (body.error === "banned") {
      const why = body.banReason ? `&why=${encodeURIComponent(body.banReason)}` : "";
      window.location.href = `/login?reason=banned${why}`;
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  session: () => req("/api/auth/session"),
  registerEmail: (name, email, password, phone, username, referralCode) =>
    req("/api/auth/register-email", { method: "POST", body: JSON.stringify({ name, email, password, phone, username, referralCode }) }),
  // Live availability check for the registration form's @handle field.
  // Unauthenticated, since it runs before the account exists.
  checkUsername: (u) => req(`/api/auth/username-available?u=${encodeURIComponent(u)}`),
  loginEmail: (email, password) =>
    req("/api/auth/login-email", { method: "POST", body: JSON.stringify({ email, password }) }),
  // Забытый пароль: код в собственный чат аккаунта с Shalter. На экран входа
  // не выведено — там остался единственный способ, пара «почта + телефон» ниже.
  startPhoneRecovery: (phone) => req("/api/auth/recover/phone/start", { method: "POST", body: JSON.stringify({ phone }) }),
  finishPhoneRecovery: (phone, code, password) =>
    req("/api/auth/recover/phone/verify", { method: "POST", body: JSON.stringify({ phone, code, password }) }),
  switchAccount: (userId) => req("/api/auth/switch", { method: "POST", body: JSON.stringify({ userId }) }),
  logout: (uid) => req("/api/auth/logout", { method: "POST", body: JSON.stringify({ uid }) }),
  deleteAccount: (password) => req("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ password }) }),
  changePassword: (currentPassword, newPassword) =>
    req("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  // Two steps: the code goes to the new address, so it is that address being
  // proved, not merely typed (server/data/emailChanges.js).
  // Восстановление по паре «почта + телефон», без кода. Два шага: проверка пары
  // и собственно смена пароля — сервер проверяет пару в обоих (auth.js).
  checkRecoveryPair: (email, phone) => req("/api/auth/recover/pair/check", { method: "POST", body: JSON.stringify({ email, phone }) }),
  finishPairRecovery: (email, phone, password) =>
    req("/api/auth/recover/pair/reset", { method: "POST", body: JSON.stringify({ email, phone, password }) }),
  startEmailChange: (password, email) => req("/api/auth/email/start", { method: "POST", body: JSON.stringify({ password, email }) }),
  confirmEmailChange: (code) => req("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ code }) }),

  startQrLogin: () => req("/api/auth/qr/start", { method: "POST" }),
  pollQrLogin: (token) => req(`/api/auth/qr/poll?token=${encodeURIComponent(token)}`),
  confirmQrLogin: (token) => req("/api/auth/qr/confirm", { method: "POST", body: JSON.stringify({ token }) }),

  startCodeLogin: (phone) => req("/api/auth/code/start", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyCodeLogin: (phone, code) => req("/api/auth/code/verify", { method: "POST", body: JSON.stringify({ phone, code }) }),

  // Two-factor authentication (TOTP — server/lib/totp.js). A login whose
  // account has it on comes back as { twoFactorRequired, ticket } with no
  // session; twoFactorLogin trades that ticket plus a code for one.
  twoFactorLogin: (ticket, code) => req("/api/auth/2fa/login", { method: "POST", body: JSON.stringify({ ticket, code }) }),
  getTwoFactor: () => req("/api/auth/2fa"),
  // `method`: "totp" (authenticator app) or "chat" (code posted into the Shalter
  // service chat).
  setupTwoFactor: (method) => req("/api/auth/2fa/setup", { method: "POST", body: JSON.stringify({ method }) }),
  sendTwoFactorCode: (ticket) => req("/api/auth/2fa/send-code", { method: "POST", body: JSON.stringify({ ticket }) }),
  enableTwoFactor: (code) => req("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disableTwoFactor: (code) => req("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),

  updateProfile: (id, patch) => req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // Profile photos — always your own, so no id: the session decides whose.
  listAvatars: () => req("/api/avatars"),
  addAvatar: (entry) => req("/api/avatars", { method: "POST", body: JSON.stringify(entry) }),
  setMainAvatar: (index) => req(`/api/avatars/${index}/main`, { method: "POST" }),
  removeAvatar: (index) => req(`/api/avatars/${index}`, { method: "DELETE" }),
  listUsers: () => req("/api/users"),
  getUser: (id) => req(`/api/users/${id}`),
  setBlocked: (userId, blocked) =>
    req(`/api/users/${userId}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),
  getSharedMedia: (userId) => req(`/api/users/${userId}/shared-media`),

  // Opens (or returns) the DM with the support account.
  openSupportChat: () => req("/api/support/chat", { method: "POST" }),

  listChats: () => req("/api/chats"),
  getChat: (id) => req(`/api/chats/${id}`),
  patchChat: (id, patch) => req(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChat: (id) => req(`/api/chats/${id}`, { method: "DELETE" }),
  deleteChatForMe: (id) => req(`/api/chats/${id}/delete-for-me`, { method: "POST" }),
  startDm: (userId, title, avatarColor) =>
    req("/api/chats", { method: "POST", body: JSON.stringify({ userId, title, avatarColor }) }),
  // `extra` carries what the create dialog now asks for up front: description,
  // @username and whether it's public.
  createChannel: (title, avatarImage, memberIds, adminIds, extra = {}) =>
    req("/api/chats/channels", { method: "POST", body: JSON.stringify({ title, avatarImage, memberIds, adminIds, ...extra }) }),
  createGroup: (title, memberIds, avatarImage, adminIds, extra = {}) =>
    req("/api/chats/groups", { method: "POST", body: JSON.stringify({ title, memberIds, avatarImage, adminIds, ...extra }) }),
  // The username auction (server/routes/usernames.js).
  listUsernameAuctions: () => req("/api/usernames"),
  // Рынок перепродажи: владелец сам назначает цену, покупка мгновенная
  // (в отличие от аукциона выше, где хендл раздаёт администрация).
  listUsernameMarket: () => req("/api/usernames/market"),
  sellUsername: (priceStars) => req("/api/usernames/market", { method: "POST", body: JSON.stringify({ priceStars }) }),
  withdrawUsernameListing: (id) => req(`/api/usernames/market/${id}`, { method: "DELETE" }),
  buyUsername: (id) => req(`/api/usernames/market/${id}/buy`, { method: "POST", body: "{}" }),
  createUsernameAuction: (username, startPriceStars, hours) =>
    req("/api/usernames", { method: "POST", body: JSON.stringify({ username, startPriceStars, hours }) }),
  bidUsername: (id, stars) => req(`/api/usernames/${id}/bid`, { method: "POST", body: JSON.stringify({ stars }) }),
  closeUsernameAuction: (id) => req(`/api/usernames/${id}/close`, { method: "POST" }),
  deleteUsernameAuction: (id) => req(`/api/usernames/${id}`, { method: "DELETE" }),
  // By phone number — that's what the admin is given, not an internal id.
  grantUsername: (phone, username) =>
    req("/api/usernames/grant", { method: "POST", body: JSON.stringify({ phone, username }) }),
  // Renaming a bot / changing its picture and description.
  updateBot: (id, patch) => req(`/api/bots/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeCallParticipant: (callId, userId) => req(`/api/calls/${callId}/participants/${userId}`, { method: "DELETE" }),
  // The command list a bot advertises — what the composer's "/" menu shows.
  setBotCommands: (id, commands) => req(`/api/bots/${id}/commands`, { method: "PUT", body: JSON.stringify({ commands }) }),
  // The discussion group behind a channel's comments: "create" | "link" | "unlink".
  setChatDiscussion: (id, action, groupId) =>
    req(`/api/chats/${id}/discussion`, { method: "POST", body: JSON.stringify({ action, groupId }) }),
  // Muting for a period (Telegram's 1h/8h/2d/forever), and slow mode.
  muteChat: (id, opts) => req(`/api/chats/${id}/mute`, { method: "POST", body: JSON.stringify(opts) }),
  setSlowMode: (id, seconds) => req(`/api/chats/${id}/slow-mode`, { method: "POST", body: JSON.stringify({ seconds }) }),
  // Join requests — the queue an invite link feeds when approval is on.
  listJoinRequests: (id) => req(`/api/chats/${id}/join-requests`),
  answerJoinRequest: (id, userId, approve) =>
    req(`/api/chats/${id}/join-requests/${userId}`, { method: "POST", body: JSON.stringify({ approve }) }),
  // approveJoins / signMessages
  setChatSettings: (id, patch) => req(`/api/chats/${id}/settings`, { method: "POST", body: JSON.stringify(patch) }),
  // What ordinary members of a group may do (server/lib/chatPermissions.js).
  getChatPermissions: (id) => req(`/api/chats/${id}/permissions`),
  setChatPermissions: (id, permissions) =>
    req(`/api/chats/${id}/permissions`, { method: "POST", body: JSON.stringify({ permissions }) }),
  searchInChat: (id, q) => req(`/api/chats/${id}/messages/search?q=${encodeURIComponent(q)}`),
  // Invite links — how anyone joins a private group or channel.
  chatInviteLink: (id, revoke = false) => req(`/api/chats/${id}/invite`, { method: "POST", body: JSON.stringify({ revoke }) }),
  inviteInfo: (code) => req(`/api/chats/invite/${encodeURIComponent(code)}`),
  joinByInvite: (code) => req(`/api/chats/invite/${encodeURIComponent(code)}/join`, { method: "POST" }),
  // The palette this chat's level has unlocked (server/lib/chatFeatures.js).
  getChatFeatures: (id) => req(`/api/chats/${id}/features`),
  setChannelPublic: (id, isPublic, username) =>
    req(`/api/chats/${id}/public`, { method: "POST", body: JSON.stringify({ isPublic, username }) }),
  discoverChannels: (q) => req(`/api/channels?q=${encodeURIComponent(q ?? "")}`),
  subscribeChannel: (id) => req(`/api/channels/${id}/subscribe`, { method: "POST" }),
  leaveChat: (id) => req(`/api/chats/${id}/leave`, { method: "POST" }),
  clearHistory: (id, forEveryone) =>
    req(`/api/chats/${id}/clear`, { method: "POST", body: JSON.stringify({ forEveryone: !!forEveryone }) }),
  setChatWallpaper: (id, wallpaper) =>
    req(`/api/chats/${id}/wallpaper`, { method: "POST", body: JSON.stringify({ wallpaper }) }),
  setDraft: (id, text) => req(`/api/chats/${id}/draft`, { method: "POST", body: JSON.stringify({ text }) }),
  setMemberRole: (id, userId, role) =>
    req(`/api/chats/${id}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),
  // The label the whole chat sees next to a member — owner-only, empty clears it.
  setMemberTitle: (id, userId, title) =>
    req(`/api/chats/${id}/title`, { method: "POST", body: JSON.stringify({ userId, title }) }),
  restrictMember: (id, userId, until) =>
    req(`/api/chats/${id}/restrict`, { method: "POST", body: JSON.stringify({ userId, until }) }),
  voteForGroup: (id) => req(`/api/chats/${id}/vote`, { method: "POST" }),

  // Paged newest-first (server/routes/messages.js): omit `before` for the latest
  // page, pass the oldest loaded message's createdAt to walk further back.
  listMessages: (chatId, opts = {}) => {
    const q = new URLSearchParams();
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.before) q.set("before", opts.before);
    const qs = q.toString();
    return req(`/api/chats/${chatId}/messages${qs ? `?${qs}` : ""}`);
  },
  sendMessage: (chatId, text, opts) =>
    req(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ text, ...opts }) }),
  editMessage: (chatId, messageId, text) =>
    req(`/api/chats/${chatId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  deleteMessage: (chatId, messageId, forEveryone) =>
    req(`/api/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
      body: JSON.stringify({ forEveryone: !!forEveryone }),
    }),
  react: (chatId, messageId, emoji) =>
    req(`/api/chats/${chatId}/messages/${messageId}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),
  pinMessage: (chatId, messageId, pinned) =>
    req(`/api/chats/${chatId}/messages/${messageId}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }),
  votePoll: (chatId, messageId, optionIndex) =>
    req(`/api/chats/${chatId}/messages/${messageId}/vote`, { method: "POST", body: JSON.stringify({ optionIndex }) }),
  getThread: (chatId, messageId) => req(`/api/chats/${chatId}/messages/${messageId}/thread`),
  // Комментарии к отдельному посту канала — своя ветка на каждый пост
  // (server/routes/posts.js). Вступление в группу обсуждения происходит само,
  // первым отправленным комментарием.
  // Один просмотр поста от текущего читателя. Сервер сам решает, засчитывать
  // ли: повторные открытия и собственные посты не считаются.
  viewPost: (postId) => req(`/api/posts/${postId}/view`, { method: "POST", body: "{}" }),
  // Статистика канала — только для тех, кто им управляет (routes/channels.js).
  getChannelStats: (chatId) => req(`/api/channels/${chatId}/stats`),
  getPostComments: (postId) => req(`/api/posts/${postId}/comments`),
  sendPostComment: (postId, text, extra = {}) =>
    req(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text, ...extra }) }),
  sendTyping: (chatId) => req(`/api/chats/${chatId}/typing`, { method: "POST" }),
  getTyping: (chatId) => req(`/api/chats/${chatId}/typing`),

  listScheduled: (chatId) => req(`/api/chats/${chatId}/messages/scheduled`),
  scheduleMessage: (chatId, opts) =>
    req(`/api/chats/${chatId}/messages/scheduled`, { method: "POST", body: JSON.stringify(opts) }),
  editScheduled: (chatId, scheduledId, patch) =>
    req(`/api/chats/${chatId}/messages/scheduled/${scheduledId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteScheduled: (chatId, scheduledId) =>
    req(`/api/chats/${chatId}/messages/scheduled/${scheduledId}`, { method: "DELETE" }),

  listFolders: () => req("/api/folders"),
  createFolder: (name, chatIds) => req("/api/folders", { method: "POST", body: JSON.stringify({ name, chatIds }) }),
  patchFolder: (id, patch) => req(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteFolder: (id) => req(`/api/folders/${id}`, { method: "DELETE" }),

  listContacts: () => req("/api/contacts"),
  addContact: (userId, localName) => req("/api/contacts", { method: "POST", body: JSON.stringify({ userId, localName }) }),
  renameContact: (userId, localName) => req("/api/contacts/rename", { method: "POST", body: JSON.stringify({ userId, localName }) }),
  findUserByUsername: (username) => req(`/api/users/by-username/${encodeURIComponent(username.replace(/^@/, ""))}`),
  // Address-book import (components/importContactsDialog.js): send [{name, phone}],
  // get back who's already registered and who can be invited. Nothing is stored
  // server-side — see server/routes/contacts.js's /match.
  matchContacts: (contacts) => req("/api/contacts/match", { method: "POST", body: JSON.stringify({ contacts }) }),
  removeContact: (userId) => req("/api/contacts", { method: "DELETE", body: JSON.stringify({ userId }) }),

  // "Hugo" — the composer's writing checker (server/routes/hugo.js). Proxied
  // server-side so the checking service never sees a user's IP and the endpoint
  // stays swappable for a self-hosted one.
  hugoCheck: (text) => req("/api/hugo/check", { method: "POST", body: JSON.stringify({ text }) }),

  getSettings: () => req("/api/settings"),
  patchSettings: (patch) => req("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  getStorageUsage: () => req("/api/settings/storage"),

  listSessions: () => req("/api/sessions"),
  terminateSession: (deviceId) => req(`/api/sessions/${deviceId}`, { method: "DELETE" }),
  terminateOtherSessions: () => req("/api/sessions/terminate-others", { method: "POST" }),

  listCalls: () => req("/api/calls"),
  placeCall: (chatId, kind) => req("/api/calls", { method: "POST", body: JSON.stringify({ chatId, kind }) }),
  patchCall: (id, patch) => req(`/api/calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addCallParticipant: (id, userId) =>
    req(`/api/calls/${id}/participants`, { method: "POST", body: JSON.stringify({ userId }) }),
  createCallInviteLink: (id) => req(`/api/calls/${id}/invite-link`, { method: "POST" }),
  joinCallByLink: (token) => req(`/api/calls/join/${token}`, { method: "POST" }),
  sendSignal: (callId, toUserId, kind, data) =>
    req(`/api/calls/${callId}/signal`, { method: "POST", body: JSON.stringify({ toUserId, kind, data }) }),
  pollSignals: (callId, after) => req(`/api/calls/${callId}/signal?after=${after}`),

  listBots: () => req("/api/bots"),
  createBot: (name, avatarImage, description) =>
    req("/api/bots", { method: "POST", body: JSON.stringify({ name, avatarImage, description }) }),
  // Посмотреть токен ещё раз — без перевыпуска, который сломал бы работающего бота.
  getBotToken: (id) => req(`/api/bots/${id}/token`),
  // Сколько людей пользуется ботом — показывается в шапке его чата.
  getBotAudience: (userId) => req(`/api/bots/audience/${userId}`),
  regenerateBotToken: (id) => req(`/api/bots/${id}/regenerate-token`, { method: "POST" }),
  deleteBot: (id) => req(`/api/bots/${id}`, { method: "DELETE" }),
  saveBotCode: (id, code) => req(`/api/bots/${id}/code`, { method: "PUT", body: JSON.stringify({ code }) }),
  testBotCode: (id, code, text) => req(`/api/bots/${id}/test`, { method: "POST", body: JSON.stringify({ code, text }) }),
  getBotLogs: (id) => req(`/api/bots/${id}/logs`),
  search: (q) => req(`/api/search?q=${encodeURIComponent(q)}`),

  publishPost: (channelId, text, attachments) =>
    req(`/api/posts/${channelId}/publish`, { method: "POST", body: JSON.stringify({ text, attachments }) }),

  getVapidPublicKey: () => req("/api/push/vapid-public-key"),
  subscribePush: (subscription) => req("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint) => req("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),

  submitReport: (targetType, targetId, reason, details) =>
    req("/api/reports", { method: "POST", body: JSON.stringify({ targetType, targetId, reason, details }) }),
  resolveReport: (reportId, action, messageId) =>
    req(`/api/reports/${reportId}/resolve`, { method: "POST", body: JSON.stringify({ action, messageId }) }),

  getDonationAlertsStatus: () => req("/api/donation-alerts/status"),

  listStories: () => req("/api/stories"),
  postStory: (kind, url) => req("/api/stories", { method: "POST", body: JSON.stringify({ kind, url }) }),
  viewStory: (id) => req(`/api/stories/${id}/view`, { method: "POST" }),
  deleteStory: (id) => req(`/api/stories/${id}`, { method: "DELETE" }),

  translateText: (text, target) => req("/api/translate", { method: "POST", body: JSON.stringify({ text, target }) }),
  translateBatch: (texts, target) => req("/api/translate/batch", { method: "POST", body: JSON.stringify({ texts, target }) }),

  getPremiumInfo: () => req("/api/premium/me"),
  requestPremium: () => req("/api/premium/request", { method: "POST" }),
  // Admin-only grants (server/routes/premium.js's and ads.js's /grant): pass a
  // day count, or { forever: true } for permanent. premium/active false revokes.
  grantPremium: (userId, premium = true, opts = {}) =>
    req("/api/premium/grant", { method: "POST", body: JSON.stringify({ userId, premium, ...opts }) }),
  grantAds: (userId, active = true, opts = {}) =>
    req("/api/ads/grant", { method: "POST", body: JSON.stringify({ userId, active, ...opts }) }),

  // User-made sticker packs (server/routes/stickers.js). The built-in set is
  // client-side and isn't fetched.
  listStickerPacks: () => req("/api/stickers/packs"),
  createStickerPack: (pack) => req("/api/stickers/packs", { method: "POST", body: JSON.stringify(pack) }),
  updateStickerPack: (id, patch) => req(`/api/stickers/packs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteStickerPack: (id) => req(`/api/stickers/packs/${id}`, { method: "DELETE" }),

  // Stars — the in-app currency (server/routes/stars.js).
  getStars: () => req("/api/stars"),
  requestStars: (packId) => req("/api/stars/request", { method: "POST", body: JSON.stringify({ packId }) }),
  grantStars: (userId, stars) => req("/api/stars/grant", { method: "POST", body: JSON.stringify({ userId, stars }) }),
  setMessagePrice: (stars) => req("/api/stars/price", { method: "POST", body: JSON.stringify({ stars }) }),
  boostMessage: (messageId) => req(`/api/stars/boost/${messageId}`, { method: "POST" }),
  paidDeleteMessage: (messageId) => req(`/api/stars/delete/${messageId}`, { method: "POST" }),

  listGifts: () => req("/api/gifts"),
  // Buying a gift with stars — instant, no admin in the loop.
  buyGift: (giftId, recipientId) => req("/api/gifts/buy", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),
  // Trading a received gift back for stars.
  convertGift: (entryId) => req(`/api/gifts/received/${encodeURIComponent(entryId)}/convert`, { method: "POST" }),
  // Takes a received gift off your own profile shelf.
  removeReceivedGift: (entryId) => req(`/api/gifts/received/${encodeURIComponent(entryId)}`, { method: "DELETE" }),
  // Admin-only catalogue management (server/routes/gifts.js's /catalog routes):
  // change a limited run's size, mint a new gift, remove one never issued.
  adminGiftCatalog: () => req("/api/gifts/catalog"),
  adminSetGiftSupply: (id, supply) =>
    req(`/api/gifts/catalog/${encodeURIComponent(id)}/supply`, { method: "POST", body: JSON.stringify({ supply }) }),
  adminCreateGift: (gift) => req("/api/gifts/catalog", { method: "POST", body: JSON.stringify(gift) }),
  adminDeleteGift: (id) => req(`/api/gifts/catalog/${encodeURIComponent(id)}`, { method: "DELETE" }),
  requestGift: (giftId, recipientId) =>
    req("/api/gifts/request", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),

  getAdsInfo: () => req("/api/ads/me"),
  requestAds: () => req("/api/ads/request", { method: "POST" }),
  setAdContent: (text, url, attachments) => req("/api/ads/content", { method: "PUT", body: JSON.stringify({ text, url, attachments }) }),
  deliverGift: (giftId, recipientId) =>
    req("/api/gifts/deliver", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),

  // Admin-only lawful-request data export (server/routes/admin.js). Gated
  // server-side to the ADMIN_PHONE holder — these will 403 for anyone else.
  adminLookupUser: (q) => req(`/api/admin/lookup?q=${encodeURIComponent(q)}`),
  adminExportUser: (userId, reason) =>
    req("/api/admin/export", { method: "POST", body: JSON.stringify({ userId, reason }) }),
  adminListExports: () => req("/api/admin/exports"),


  // Admin-only moderation (same 403 gate). Open reports + who's currently
  // banned or carries a safety label, the reports filed against one account,
  // and the two actions: ban/unban, set/clear label.
  adminModeration: () => req("/api/admin/moderation"),
  adminUserReports: (userId) => req(`/api/admin/users/${userId}/reports`),
  adminSetBanned: (userId, banned, reason) =>
    req(`/api/admin/users/${userId}/ban`, { method: "POST", body: JSON.stringify({ banned, reason }) }),
  // The verified check — accounts, bots, channels and groups all go through
  // these two (server/routes/admin.js).
  adminSetVerified: (userId, verified) =>
    req(`/api/admin/users/${userId}/verify`, { method: "POST", body: JSON.stringify({ verified }) }),
  adminSetChatVerified: (chatId, verified) =>
    req(`/api/admin/chats/${chatId}/verify`, { method: "POST", body: JSON.stringify({ verified }) }),
  // Deleting somebody else's account — developer only, needs the handle typed
  // back and a reason for the journal.
  adminDeleteUser: (userId, confirm, reason) =>
    req(`/api/admin/users/${userId}`, { method: "DELETE", body: JSON.stringify({ confirm, reason }) }),
  // Сброс чужого пароля — последняя дверь, когда все остальные закрыты
  // (нет почты, нигде не выполнен вход). Требует того же, что и удаление:
  // введённый юзернейм и основание для журнала.
  adminResetPassword: (userId, { password, confirm, reason, disableTwoFactor }) =>
    req(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password, confirm, reason, disableTwoFactor }),
    }),
  // Проверка отправки почты: логинится на SMTP-сервер и возвращает его ответ.
  adminMailStatus: () => req("/api/admin/mail-status"),
  adminSetSafetyLabel: (userId, label) =>
    req(`/api/admin/users/${userId}/label`, { method: "POST", body: JSON.stringify({ label }) }),
};
