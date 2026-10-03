import { trackRequest } from "./lib/netStatus.js";

// Имя контакта подставляется сервером везде (как в Telegram), поэтому после
// добавления/переименования/удаления app.js перечитывает чаты и сбрасывает кэш.
async function contactsChanged(userId, request) {
  const result = await request;
  window.dispatchEvent(new CustomEvent("shalter:contacts-changed", { detail: { userId } }));
  return result;
}

async function req(url, init) {
  const res = await trackRequest(
    fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "session_revoked") window.location.href = "/login?reason=revoked";
    if (body.error === "banned") {
      const why = body.banReason ? `&why=${encodeURIComponent(body.banReason)}` : "";
      window.location.href = `/login?reason=banned${why}`;
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  session: () => {
    const early = window.__boot?.session;
    if (early) {
      window.__boot.session = null;
      return early.then((r) => r ?? req("/api/auth/session"));
    }
    return req("/api/auth/session");
  },
  bootstrap: () => {
    const early = window.__boot?.data;
    if (early) {
      window.__boot.data = null;
      return early.then((r) => r ?? req("/api/bootstrap"));
    }
    return req("/api/bootstrap");
  },
  registerEmail: (name, email, password, phone, username, lastName) =>
    req("/api/auth/register-email", { method: "POST", body: JSON.stringify({ name, email, password, phone, username, lastName }) }),
  checkUsername: (u) => req(`/api/auth/username-available?u=${encodeURIComponent(u)}`),
  loginEmail: (email, password) =>
    req("/api/auth/login-email", { method: "POST", body: JSON.stringify({ email, password }) }),
  startPhoneRecovery: (phone) => req("/api/auth/recover/phone/start", { method: "POST", body: JSON.stringify({ phone }) }),
  finishPhoneRecovery: (phone, code, password) =>
    req("/api/auth/recover/phone/verify", { method: "POST", body: JSON.stringify({ phone, code, password }) }),
  switchAccount: (userId) => req("/api/auth/switch", { method: "POST", body: JSON.stringify({ userId }) }),
  logout: (uid) => req("/api/auth/logout", { method: "POST", body: JSON.stringify({ uid }) }),
  getPinnableChannels: () => req("/api/users/me/pinnable-channels"),
  setPinnedChannels: (chatIds) =>
    req("/api/users/me/pinned-channels", { method: "PUT", body: JSON.stringify({ chatIds }) }),
  getStoryViewers: (id) => req(`/api/stories/${id}/viewers`),
  getUserStories: (userId) => req(`/api/stories/user/${userId}`),
  getStoriesArchive: (userId) => req(`/api/stories/user/${userId}/archive`),
  listAdCampaigns: () => req("/api/ads/campaigns"),
  createAdCampaign: (data) => req("/api/ads/campaigns", { method: "POST", body: JSON.stringify(data) }),
  updateAdCampaign: (id, patch) => req(`/api/ads/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAdCampaign: (id) => req(`/api/ads/campaigns/${id}`, { method: "DELETE" }),
  topUpAdCampaign: (id, stars) => req(`/api/ads/campaigns/${id}/budget`, { method: "POST", body: JSON.stringify({ stars }) }),
  setAdCampaignStatus: (id, status) => req(`/api/ads/campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  adCampaignStats: (id) => req(`/api/ads/campaigns/${id}/stats`),
  serveAd: (placement, owner) =>
    req(`/api/ads/serve?placement=${encodeURIComponent(placement)}${owner ? `&owner=${encodeURIComponent(owner)}` : ""}`),
  clickAd: (id) => req(`/api/ads/click/${id}`, { method: "POST", body: "{}" }),
  adsForReview: () => req("/api/ads/review"),
  reviewAd: (id, approve, reason) => req(`/api/ads/review/${id}`, { method: "POST", body: JSON.stringify({ approve, reason }) }),


  getSafetyLabels: () => req("/api/labels"),
  adminCreateLabel: (label) => req("/api/admin/labels", { method: "POST", body: JSON.stringify(label) }),
  adminUpdateLabel: (id, patch) => req(`/api/admin/labels/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminDeleteLabel: (id) => req(`/api/admin/labels/${encodeURIComponent(id)}`, { method: "DELETE" }),
  verifyPassword: (password) => req("/api/auth/verify-password", { method: "POST", body: JSON.stringify({ password }) }),
  deleteAccount: (password) => req("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ password }) }),
  changePassword: (currentPassword, newPassword) =>
    req("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
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

  twoFactorLogin: (ticket, code) => req("/api/auth/2fa/login", { method: "POST", body: JSON.stringify({ ticket, code }) }),
  getTwoFactor: () => req("/api/auth/2fa"),
  setupTwoFactor: (method) => req("/api/auth/2fa/setup", { method: "POST", body: JSON.stringify({ method }) }),
  sendTwoFactorCode: (ticket) => req("/api/auth/2fa/send-code", { method: "POST", body: JSON.stringify({ ticket }) }),
  scheduleAccountDeletion: (ticket) => req("/api/auth/schedule-deletion", { method: "POST", body: JSON.stringify({ ticket }) }),
  cancelAccountDeletion: (ticket) => req("/api/auth/cancel-deletion", { method: "POST", body: JSON.stringify({ ticket }) }),
  enableTwoFactor: (code) => req("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disableTwoFactor: (code) => req("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  setCloudPassword: ({ password, hint, accountPassword, currentPassword }) =>
    req("/api/auth/2fa/cloud-password", {
      method: "POST",
      body: JSON.stringify({ password, hint, accountPassword, currentPassword }),
    }),

  updateProfile: (id, patch) => req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  setProfileTrack: (track) => req("/api/profile-track", { method: "POST", body: JSON.stringify(track) }),
  clearProfileTrack: () => req("/api/profile-track", { method: "DELETE" }),
  listAvatars: () => req("/api/avatars"),
  addAvatar: (entry) => req("/api/avatars", { method: "POST", body: JSON.stringify(entry) }),
  setMainAvatar: (index) => req(`/api/avatars/${index}/main`, { method: "POST" }),
  removeAvatar: (index) => req(`/api/avatars/${index}`, { method: "DELETE" }),
  getStatusCatalog: () => req("/api/status-catalog"),
  listMyStatuses: () => req("/api/status/me"),
  addMyStatus: (entry) => req("/api/status/me", { method: "POST", body: JSON.stringify(entry) }),
  setActiveStatus: (id) => req("/api/status/me/active", { method: "POST", body: JSON.stringify({ id }) }),
  removeMyStatus: (id) => req(`/api/status/me/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminCreateStatusCatalogItem: (item) => req("/api/admin/status-catalog", { method: "POST", body: JSON.stringify(item) }),
  adminDeleteStatusCatalogItem: (id) => req(`/api/admin/status-catalog/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getBlockedUsers: () => req("/api/users/blocked"),
  getUser: (id) => req(`/api/users/${id}`),
  setBlocked: (userId, blocked) =>
    req(`/api/users/${userId}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),
  getSharedMedia: (userId) => req(`/api/users/${userId}/shared-media`),
  getCommonChats: (userId) => req(`/api/users/${userId}/common-chats`),

  openSupportChat: () => req("/api/support/chat", { method: "POST" }),
  openBugReportChat: () => req("/api/support/report", { method: "POST" }),
  getPartnerInfo: () => req("/api/partners/me"),
  listOAuthApps: () => req("/api/oauth/apps"),
  createOAuthApp: (name, redirectUri) => req("/api/oauth/apps", { method: "POST", body: JSON.stringify({ name, redirectUri }) }),
  deleteOAuthApp: (id) => req(`/api/oauth/apps/${id}`, { method: "DELETE" }),
  regenerateOAuthApp: (id) => req(`/api/oauth/apps/${id}/regenerate`, { method: "POST" }),
  getOAuthAppSecret: (id) => req(`/api/oauth/apps/${id}/secret`),
  getOAuthAppInfo: (clientId, redirectUri) =>
    req(`/api/oauth/app-info?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`),
  approveOAuth: (clientId, redirectUri, state) =>
    req("/api/oauth/authorize", { method: "POST", body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri, state }) }),
  openPartnerChat: () => req("/api/partners/chat", { method: "POST" }),

  listChats: () => req("/api/chats"),
  getChat: (id) => req(`/api/chats/${id}`),
  patchChat: (id, patch) => req(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChat: (id, reason) => req(`/api/chats/${id}`, { method: "DELETE", ...(reason ? { body: JSON.stringify({ reason }) } : {}) }),
  adminDeleteBot: (userId, reason) => req(`/api/admin/bots/${userId}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  deleteChatForMe: (id) => req(`/api/chats/${id}/delete-for-me`, { method: "POST" }),
  markChatRead: (id) => req(`/api/chats/${id}/read`, { method: "POST" }),
  setPinnedChatOrder: (chatIds) => req("/api/chats/pinned-order", { method: "POST", body: JSON.stringify({ chatIds }) }),
  startSecretChat: (userId) => req("/api/chats/secret", { method: "POST", body: JSON.stringify({ userId }) }),
  startDm: (userId, title, avatarColor) =>
    req("/api/chats", { method: "POST", body: JSON.stringify({ userId, title, avatarColor }) }),
  createChannel: (title, avatarImage, memberIds, adminIds, extra = {}) =>
    req("/api/chats/channels", { method: "POST", body: JSON.stringify({ title, avatarImage, memberIds, adminIds, ...extra }) }),
  createGroup: (title, memberIds, avatarImage, adminIds, extra = {}) =>
    req("/api/chats/groups", { method: "POST", body: JSON.stringify({ title, memberIds, avatarImage, adminIds, ...extra }) }),
  listUsernameAuctions: () => req("/api/usernames"),
  listUsernameMarket: () => req("/api/usernames/market"),
  sellUsername: (priceStars) => req("/api/usernames/market", { method: "POST", body: JSON.stringify({ priceStars }) }),
  withdrawUsernameListing: (id) => req(`/api/usernames/market/${id}`, { method: "DELETE" }),
  buyUsername: (id) => req(`/api/usernames/market/${id}/buy`, { method: "POST", body: "{}" }),
  createUsernameAuction: (username, startPriceStars, hours) =>
    req("/api/usernames", { method: "POST", body: JSON.stringify({ username, startPriceStars, hours }) }),
  bidUsername: (id, stars) => req(`/api/usernames/${id}/bid`, { method: "POST", body: JSON.stringify({ stars }) }),
  closeUsernameAuction: (id) => req(`/api/usernames/${id}/close`, { method: "POST" }),
  deleteUsernameAuction: (id) => req(`/api/usernames/${id}`, { method: "DELETE" }),
  grantUsername: (phone, username) =>
    req("/api/usernames/grant", { method: "POST", body: JSON.stringify({ phone, username }) }),
  broadcastBot: (id, text) => req(`/api/bots/${id}/broadcast`, { method: "POST", body: JSON.stringify({ text }) }),
  updateBot: (id, patch) => req(`/api/bots/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeCallParticipant: (callId, userId) => req(`/api/calls/${callId}/participants/${userId}`, { method: "DELETE" }),
  setBotCommands: (id, commands) => req(`/api/bots/${id}/commands`, { method: "PUT", body: JSON.stringify({ commands }) }),
  setChatDiscussion: (id, action, groupId) =>
    req(`/api/chats/${id}/discussion`, { method: "POST", body: JSON.stringify({ action, groupId }) }),
  muteChat: (id, opts) => req(`/api/chats/${id}/mute`, { method: "POST", body: JSON.stringify(opts) }),
  setSlowMode: (id, seconds) => req(`/api/chats/${id}/slow-mode`, { method: "POST", body: JSON.stringify({ seconds }) }),
  setCommentPrice: (id, stars) => req(`/api/chats/${id}/comment-price`, { method: "POST", body: JSON.stringify({ stars }) }),
  listJoinRequests: (id) => req(`/api/chats/${id}/join-requests`),
  answerJoinRequest: (id, userId, approve) =>
    req(`/api/chats/${id}/join-requests/${userId}`, { method: "POST", body: JSON.stringify({ approve }) }),
  setChatSettings: (id, patch) => req(`/api/chats/${id}/settings`, { method: "POST", body: JSON.stringify(patch) }),
  getChatPermissions: (id) => req(`/api/chats/${id}/permissions`),
  setChatPermissions: (id, permissions) =>
    req(`/api/chats/${id}/permissions`, { method: "POST", body: JSON.stringify({ permissions }) }),
  setAllowedReactions: (id, reactions) =>
    req(`/api/chats/${id}/reactions`, { method: "POST", body: JSON.stringify({ reactions }) }),
  searchInChat: (id, q) => req(`/api/chats/${id}/messages/search?q=${encodeURIComponent(q)}`),
  chatInviteLink: (id, revoke = false) => req(`/api/chats/${id}/invite`, { method: "POST", body: JSON.stringify({ revoke }) }),
  inviteInfo: (code) => req(`/api/chats/invite/${encodeURIComponent(code)}`),
  getCommunity: (id) => req(`/api/communities/${id}`),
  myCommunities: () => req("/api/communities/mine"),
  communityOfChat: (chatId) => req(`/api/communities/by-chat/${chatId}`),
  createCommunity: (body) => req("/api/communities", { method: "POST", body: JSON.stringify(body) }),
  updateCommunity: (id, patch) => req(`/api/communities/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addCommunityChat: (id, chatId) => req(`/api/communities/${id}/chats`, { method: "POST", body: JSON.stringify({ chatId }) }),
  removeCommunityChat: (id, chatId) => req(`/api/communities/${id}/chats/${chatId}`, { method: "DELETE" }),
  deleteCommunity: (id) => req(`/api/communities/${id}`, { method: "DELETE" }),
  joinPublicChat: (id) => req(`/api/chats/${id}/join`, { method: "POST" }),
  listBannedMembers: (id) => req(`/api/chats/${id}/banned`),
  joinByInvite: (code) => req(`/api/chats/invite/${encodeURIComponent(code)}/join`, { method: "POST" }),
  getChatFeatures: (id) => req(`/api/chats/${id}/features`),
  setChannelPublic: (id, isPublic, username) =>
    req(`/api/chats/${id}/public`, { method: "POST", body: JSON.stringify({ isPublic, username }) }),
  discoverChannels: (q) => req(`/api/channels?q=${encodeURIComponent(q ?? "")}`),
  subscribeChannel: (id) => req(`/api/channels/${id}/subscribe`, { method: "POST" }),
  similarChannels: (id) => req(`/api/channels/${id}/similar`),
  leaveChat: (id) => req(`/api/chats/${id}/leave`, { method: "POST" }),
  clearHistory: (id, forEveryone) =>
    req(`/api/chats/${id}/clear`, { method: "POST", body: JSON.stringify({ forEveryone: !!forEveryone }) }),
  setChatWallpaper: (id, wallpaper, forEveryone, label) =>
    req(`/api/chats/${id}/wallpaper`, { method: "POST", body: JSON.stringify({ wallpaper, forEveryone: !!forEveryone, label: label ?? null }) }),
  setDraft: (id, text) => req(`/api/chats/${id}/draft`, { method: "POST", body: JSON.stringify({ text }) }),
  setMemberRole: (id, userId, role) =>
    req(`/api/chats/${id}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),
  setMemberTitle: (id, userId, title) =>
    req(`/api/chats/${id}/title`, { method: "POST", body: JSON.stringify({ userId, title }) }),
  restrictMember: (id, userId, until) =>
    req(`/api/chats/${id}/restrict`, { method: "POST", body: JSON.stringify({ userId, until }) }),
  voteForGroup: (id) => req(`/api/chats/${id}/vote`, { method: "POST" }),

  listMessages: (chatId, opts = {}) => {
    const q = new URLSearchParams();
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.before) q.set("before", opts.before);
    if (opts.beforeId) q.set("beforeId", opts.beforeId);
    if (opts.topic) q.set("topic", opts.topic);
    const qs = q.toString();
    return req(`/api/chats/${chatId}/messages${qs ? `?${qs}` : ""}`);
  },
  getChatMessageDays: (chatId, month, tz) => req(`/api/chats/${chatId}/messages/days?month=${month}&tz=${tz}`),
  getChatMessageAt: (chatId, day, tz) => req(`/api/chats/${chatId}/messages/at?day=${day}&tz=${tz}`),
  sendMessage: (chatId, text, opts) =>
    req(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ text, ...opts }) }),
  editMessage: (chatId, messageId, text) =>
    req(`/api/chats/${chatId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  updateLiveLocation: (chatId, messageId, lat, lng) =>
    req(`/api/chats/${chatId}/messages/${messageId}/location`, { method: "POST", body: JSON.stringify({ lat, lng }) }),
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
  retractPollVote: (chatId, messageId) => req(`/api/chats/${chatId}/messages/${messageId}/vote`, { method: "DELETE" }),
  closePoll: (chatId, messageId) => req(`/api/chats/${chatId}/messages/${messageId}/poll/close`, { method: "POST" }),
  getThread: (chatId, messageId) => req(`/api/chats/${chatId}/messages/${messageId}/thread`),
  viewPost: (postId) => req(`/api/posts/${postId}/view`, { method: "POST", body: "{}" }),
  getChannelStats: (chatId) => req(`/api/channels/${chatId}/stats`),
  getPostComments: (postId) => req(`/api/posts/${postId}/comments`),
  sendPostComment: (postId, text, extra = {}) =>
    req(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text, ...extra }) }),
  sendTyping: (chatId, action = "typing") =>
    req(`/api/chats/${chatId}/typing`, { method: "POST", body: JSON.stringify({ action }) }),
  getTyping: (chatId) => req(`/api/chats/${chatId}/typing`),

  setChatProtected: (chatId, enabled) =>
    req(`/api/chats/${chatId}/protect`, { method: "POST", body: JSON.stringify({ enabled }) }),
  setWelcomeText: (chatId, text) => req(`/api/chats/${chatId}/welcome`, { method: "POST", body: JSON.stringify({ text }) }),
  getAdminLog: (chatId, beforeId) => req(`/api/chats/${chatId}/admin-log${beforeId ? `?beforeId=${beforeId}` : ""}`),
  updateChecklist: (chatId, messageId, body) =>
    req(`/api/chats/${chatId}/messages/${messageId}/checklist`, { method: "POST", body: JSON.stringify(body) }),
  passkeyRegisterStart: () => req("/api/auth/passkey/register/start", { method: "POST" }),
  passkeyRegisterFinish: (body) => req("/api/auth/passkey/register/finish", { method: "POST", body: JSON.stringify(body) }),
  passkeyLoginStart: () => req("/api/auth/passkey/login/start", { method: "POST" }),
  passkeyLoginFinish: (body) => req("/api/auth/passkey/login/finish", { method: "POST", body: JSON.stringify(body) }),
  listPasskeys: () => req("/api/auth/passkeys"),
  deletePasskey: (id) => req(`/api/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  checkFrameable: (url) => req(`/api/link-check?url=${encodeURIComponent(url)}`),
  listTopics: (chatId) => req(`/api/chats/${chatId}/topics`),
  setTopicsEnabled: (chatId, enabled) =>
    req(`/api/chats/${chatId}/topics/enabled`, { method: "POST", body: JSON.stringify({ enabled }) }),
  createTopic: (chatId, data) => req(`/api/chats/${chatId}/topics`, { method: "POST", body: JSON.stringify(data) }),
  updateTopic: (chatId, topicId, patch) =>
    req(`/api/chats/${chatId}/topics/${topicId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTopic: (chatId, topicId) => req(`/api/chats/${chatId}/topics/${topicId}`, { method: "DELETE" }),
  summarizeMessage: (chatId, messageId) => req(`/api/chats/${chatId}/messages/${messageId}/summary`),
  instantView: (url) => req(`/api/link-check/instant-view?url=${encodeURIComponent(url)}`),
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
  createFolderInviteLink: (id) => req(`/api/folders/${id}/invite-link`, { method: "POST" }),
  revokeFolderInviteLink: (id) => req(`/api/folders/${id}/invite-link`, { method: "DELETE" }),
  getFolderInvite: (code) => req(`/api/folders/invite/${encodeURIComponent(code)}`),
  importFolderInvite: (code) => req(`/api/folders/invite/${encodeURIComponent(code)}/import`, { method: "POST" }),

  shareNearbyLocation: (lat, lng) => req("/api/nearby", { method: "POST", body: JSON.stringify({ lat, lng }) }),
  getNearbyUsers: (lat, lng) => req(`/api/nearby?lat=${lat}&lng=${lng}`),
  stopNearbySharing: () => req("/api/nearby", { method: "DELETE" }),

  listContacts: () => req("/api/contacts"),
  addContact: (userId, localName, { sharePhone = false } = {}) =>
    contactsChanged(userId, req("/api/contacts", { method: "POST", body: JSON.stringify({ userId, localName, sharePhone }) })),
  setContactNote: (userId, note) => req("/api/contacts/note", { method: "POST", body: JSON.stringify({ userId, note }) }),
  renameContact: (userId, localName) => contactsChanged(userId, req("/api/contacts/rename", { method: "POST", body: JSON.stringify({ userId, localName }) })),
  findChatByUsername: (username) => req(`/api/chats/by-username/${encodeURIComponent(username.replace(/^@/, ""))}`),
  findUserByUsername: (username) => req(`/api/users/by-username/${encodeURIComponent(username.replace(/^@/, ""))}`),
  matchContacts: (contacts) => req("/api/contacts/match", { method: "POST", body: JSON.stringify({ contacts }) }),
  removeContact: (userId) => contactsChanged(userId, req("/api/contacts", { method: "DELETE", body: JSON.stringify({ userId }) })),

  hugoCheck: (text) => req("/api/hugo/check", { method: "POST", body: JSON.stringify({ text }) }),

  getSettings: () => req("/api/settings"),
  patchSettings: (patch) => req("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  getStorageUsage: () => req("/api/settings/storage"),

  listSessions: () => req("/api/sessions"),
  terminateSession: (deviceId) => req(`/api/sessions/${deviceId}`, { method: "DELETE" }),
  terminateOtherSessions: () => req("/api/sessions/terminate-others", { method: "POST" }),

  listCalls: () => req("/api/calls"),
  placeCall: (chatId, kind, { ringAll = false } = {}) =>
    req("/api/calls", { method: "POST", body: JSON.stringify({ chatId, kind, ringAll }) }),
  leaveCall: (id) => req(`/api/calls/${id}/leave`, { method: "POST" }),
  answerCall: (id) => req(`/api/calls/${id}/answer`, { method: "POST" }),
  patchCall: (id, patch) => req(`/api/calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getVoiceRoom: (chatId) => req(`/api/calls/room/${chatId}`),
  joinVoiceRoom: (chatId) => req(`/api/calls/room/${chatId}/join`, { method: "POST" }),
  leaveVoiceRoom: (chatId) => req(`/api/calls/room/${chatId}/leave`, { method: "POST" }),
  addCallParticipant: (id, userId) =>
    req(`/api/calls/${id}/participants`, { method: "POST", body: JSON.stringify({ userId }) }),
  createCallInviteLink: (id) => req(`/api/calls/${id}/invite-link`, { method: "POST" }),
  joinCallByLink: (token) => req(`/api/calls/join/${token}`, { method: "POST" }),
  sendSignal: (callId, toUserId, kind, data) =>
    req(`/api/calls/${callId}/signal`, { method: "POST", body: JSON.stringify({ toUserId, kind, data }) }),
  pollSignals: (callId, after) => req(`/api/calls/${callId}/signal?after=${after}`),
  getIceServers: () => req("/api/calls/ice-servers"),

  listBots: () => req("/api/bots"),
  createBot: (name, avatarImage, description) =>
    req("/api/bots", { method: "POST", body: JSON.stringify({ name, avatarImage, description }) }),
  getBotToken: (id) => req(`/api/bots/${id}/token`),
  getBot: (id) => req(`/api/bots/${id}`),
  startLive: (chatId, { title, withVideo, source } = {}) =>
    req("/api/live", { method: "POST", body: JSON.stringify({ chatId, title, withVideo, source }) }),
  getLiveForChat: (chatId) => req(`/api/live/chat/${chatId}`),
  getLive: (id) => req(`/api/live/${id}`),
  joinLive: (id) => req(`/api/live/${id}/join`, { method: "POST", body: "{}" }),
  leaveLive: (id) => req(`/api/live/${id}/leave`, { method: "POST", body: "{}" }),
  raiseLiveHand: (id, raised) => req(`/api/live/${id}/hand`, { method: "POST", body: JSON.stringify({ raised }) }),
  setLiveRole: (id, userId, role) =>
    req(`/api/live/${id}/participants/${userId}/role`, { method: "POST", body: JSON.stringify({ role }) }),
  setLiveMuted: (id, userId, muted) =>
    req(`/api/live/${id}/participants/${userId}/mute`, { method: "POST", body: JSON.stringify({ muted }) }),
  stopLive: (id) => req(`/api/live/${id}/stop`, { method: "POST", body: "{}" }),
  sendLiveMessage: (id, text) => req(`/api/live/${id}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  editLiveMessage: (id, messageId, text) =>
    req(`/api/live/${id}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  deleteLiveMessage: (id, messageId) => req(`/api/live/${id}/messages/${messageId}`, { method: "DELETE" }),

  getContactIds: () => req("/api/contacts/ids"),
  getBotAudience: (userId) => req(`/api/bots/audience/${userId}`),
  openBotApp: (botId, { url, chatId, theme } = {}) =>
    req(`/api/bots/${botId}/app/open`, { method: "POST", body: JSON.stringify({ url, chatId, theme }) }),
  sendBotAppData: (botId, data) => req(`/api/bots/${botId}/app/data`, { method: "POST", body: JSON.stringify({ data }) }),
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
  listPushEndpoints: () => req("/api/push/endpoints"),
  getAppVersion: () => req("/api/version"),

  submitReport: (targetType, targetId, reason, details) =>
    req("/api/reports", { method: "POST", body: JSON.stringify({ targetType, targetId, reason, details }) }),
  resolveReport: (reportId, action, messageId) =>
    req(`/api/reports/${reportId}/resolve`, { method: "POST", body: JSON.stringify({ action, messageId }) }),

  getDonationAlertsStatus: () => req("/api/donation-alerts/status"),

  listStories: () => req("/api/stories"),
  postStory: (items) => req("/api/stories", { method: "POST", body: JSON.stringify({ items }) }),
  postChannelStory: (chatId, items) => req(`/api/stories/channel/${chatId}`, { method: "POST", body: JSON.stringify({ items }) }),
  viewStory: (id) => req(`/api/stories/${id}/view`, { method: "POST" }),
  deleteStory: (id) => req(`/api/stories/${id}`, { method: "DELETE" }),
  likeStory: (id) => req(`/api/stories/${id}/like`, { method: "POST" }),
  getStoryComments: (id) => req(`/api/stories/${id}/comments`),
  addStoryComment: (id, text, parentId) => req(`/api/stories/${id}/comments`, { method: "POST", body: JSON.stringify({ text, parentId }) }),
  likeStoryComment: (id, commentId) => req(`/api/stories/${id}/comments/${commentId}/like`, { method: "POST" }),
  editStoryComment: (id, commentId, text) =>
    req(`/api/stories/${id}/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  deleteStoryComment: (id, commentId) => req(`/api/stories/${id}/comments/${commentId}`, { method: "DELETE" }),

  translateText: (text, target) => req("/api/translate", { method: "POST", body: JSON.stringify({ text, target }) }),
  translateBatch: (texts, target) => req("/api/translate/batch", { method: "POST", body: JSON.stringify({ texts, target }) }),

  getPremiumInfo: () => req("/api/premium/me"),
  requestPremium: (plan) => req("/api/premium/request", { method: "POST", body: JSON.stringify({ plan }) }),
  buyPremiumWithStars: (plan) => req("/api/premium/buy-with-stars", { method: "POST", body: JSON.stringify({ plan }) }),
  getBusinessInfo: () => req("/api/business/me"),
  requestBusiness: (plan) => req("/api/business/request", { method: "POST", body: JSON.stringify({ plan }) }),
  grantPremium: (userId, premium = true, opts = {}) =>
    req("/api/premium/grant", { method: "POST", body: JSON.stringify({ userId, premium, ...opts }) }),
  grantAds: (userId, active = true, opts = {}) =>
    req("/api/ads/grant", { method: "POST", body: JSON.stringify({ userId, active, ...opts }) }),

  listStickerPacks: () => req("/api/stickers/packs"),
  createStickerPack: (pack) => req("/api/stickers/packs", { method: "POST", body: JSON.stringify(pack) }),
  updateStickerPack: (id, patch) => req(`/api/stickers/packs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteStickerPack: (id) => req(`/api/stickers/packs/${id}`, { method: "DELETE" }),

  getStars: () => req("/api/stars"),
  requestStars: (packId) => req("/api/stars/request", { method: "POST", body: JSON.stringify({ packId }) }),
  grantStars: (userId, stars) => req("/api/stars/grant", { method: "POST", body: JSON.stringify({ userId, stars }) }),
  transferStars: (userId, amount, note) =>
    req("/api/stars/transfer", { method: "POST", body: JSON.stringify({ userId, amount, note }) }),
  setMessagePrice: (stars) => req("/api/stars/price", { method: "POST", body: JSON.stringify({ stars }) }),
  boostMessage: (messageId) => req(`/api/stars/boost/${messageId}`, { method: "POST" }),
  paidDeleteMessage: (messageId) => req(`/api/stars/delete/${messageId}`, { method: "POST" }),

  listGifts: () => req("/api/gifts"),
  buyGift: (giftId, recipientId, background, anonymous) => req("/api/gifts/buy", { method: "POST", body: JSON.stringify({ giftId, recipientId, background, anonymous }) }),
  convertGift: (entryId) => req(`/api/gifts/received/${encodeURIComponent(entryId)}/convert`, { method: "POST" }),
  removeReceivedGift: (entryId) => req(`/api/gifts/received/${encodeURIComponent(entryId)}`, { method: "DELETE" }),
  setGiftPinned: (entryId, pinned) =>
    req(`/api/gifts/received/${encodeURIComponent(entryId)}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }),
  adminGiftCatalog: () => req("/api/gifts/catalog"),
  adminSetGiftSupply: (id, supply) =>
    req(`/api/gifts/catalog/${encodeURIComponent(id)}/supply`, { method: "POST", body: JSON.stringify({ supply }) }),
  adminSetGiftScene: (id, scene) =>
    req(`/api/gifts/catalog/${encodeURIComponent(id)}/scene`, { method: "POST", body: JSON.stringify({ scene }) }),
  adminCreateGift: (gift) => req("/api/gifts/catalog", { method: "POST", body: JSON.stringify(gift) }),
  adminDeleteGift: (id) => req(`/api/gifts/catalog/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminRestoreGift: (id) => req(`/api/gifts/catalog/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  requestGift: (giftId, recipientId) =>
    req("/api/gifts/request", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),

  listCustomGifts: () => req("/api/gifts/custom"),
  createCustomGift: (name, scene) => req("/api/gifts/custom", { method: "POST", body: JSON.stringify({ name, scene }) }),
  updateCustomGift: (id, patch) => req(`/api/gifts/custom/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCustomGift: (id) => req(`/api/gifts/custom/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sendCustomGift: (giftId, recipientId, background, anonymous) =>
    req("/api/gifts/custom/send", { method: "POST", body: JSON.stringify({ giftId, recipientId, background, anonymous }) }),

  listCustomEmoji: () => req("/api/custom-emoji"),
  createCustomEmoji: (name, scene) => req("/api/custom-emoji", { method: "POST", body: JSON.stringify({ name, scene }) }),
  updateCustomEmoji: (id, patch) => req(`/api/custom-emoji/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCustomEmoji: (id) => req(`/api/custom-emoji/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getAdsInfo: () => req("/api/ads/me"),
  requestAds: () => req("/api/ads/request", { method: "POST" }),
  setAdContent: (text, url, attachments) => req("/api/ads/content", { method: "PUT", body: JSON.stringify({ text, url, attachments }) }),
  deliverGift: (giftId, recipientId) =>
    req("/api/gifts/deliver", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),

  adminLookupUser: (q) => req(`/api/admin/lookup?q=${encodeURIComponent(q)}`),
  adminLookupChat: (q) => req(`/api/admin/chats/lookup?q=${encodeURIComponent(q)}`),
  adminBulkDelete: (items, reason) => req("/api/admin/moderation/delete", { method: "POST", body: JSON.stringify({ items, reason }) }),
  adminDirectory: (type, q = "") => req(`/api/admin/directory?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`),
  adminExportUser: (userId, reason) =>
    req("/api/admin/export", { method: "POST", body: JSON.stringify({ userId, reason }) }),
  adminListExports: () => req("/api/admin/exports"),

  adminModeration: () => req("/api/admin/moderation"),
  adminUserReports: (userId) => req(`/api/admin/users/${userId}/reports`),
  adminSetBanned: (userId, banned, reason) =>
    req(`/api/admin/users/${userId}/ban`, { method: "POST", body: JSON.stringify({ banned, reason }) }),
  adminSetVerified: (userId, verified) =>
    req(`/api/admin/users/${userId}/verify`, { method: "POST", body: JSON.stringify({ verified }) }),
  adminSetChatVerified: (chatId, verified) =>
    req(`/api/admin/chats/${chatId}/verify`, { method: "POST", body: JSON.stringify({ verified }) }),
  adminSetSections: (userId, sections) =>
    req(`/api/admin/users/${userId}/admin-sections`, { method: "POST", body: JSON.stringify({ sections }) }),
  adminDeleteUser: (userId, confirm, reason) =>
    req(`/api/admin/users/${userId}`, { method: "DELETE", body: JSON.stringify({ confirm, reason }) }),
  adminResetPassword: (userId, { password, confirm, reason, disableTwoFactor }) =>
    req(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password, confirm, reason, disableTwoFactor }),
    }),
  adminMailStatus: () => req("/api/admin/mail-status"),
  adminServerStats: () => req("/api/admin/server"),
  adminGetPricing: () => req("/api/admin/pricing"),
  adminUpdatePricing: (patch) => req("/api/admin/pricing", { method: "PUT", body: JSON.stringify(patch) }),
  adminResetPricing: () => req("/api/admin/pricing", { method: "DELETE" }),
  adminSetSafetyLabel: (userId, label) =>
    req(`/api/admin/users/${userId}/label`, { method: "POST", body: JSON.stringify({ label }) }),
};
