async function req(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  session: () => req("/api/auth/session"),
  registerEmail: (name, email, password, phone, referralCode) =>
    req("/api/auth/register-email", { method: "POST", body: JSON.stringify({ name, email, password, phone, referralCode }) }),
  loginEmail: (email, password) =>
    req("/api/auth/login-email", { method: "POST", body: JSON.stringify({ email, password }) }),
  switchAccount: (userId) => req("/api/auth/switch", { method: "POST", body: JSON.stringify({ userId }) }),
  logout: (uid) => req("/api/auth/logout", { method: "POST", body: JSON.stringify({ uid }) }),
  deleteAccount: (password) => req("/api/auth/delete-account", { method: "POST", body: JSON.stringify({ password }) }),

  startQrLogin: () => req("/api/auth/qr/start", { method: "POST" }),
  pollQrLogin: (token) => req(`/api/auth/qr/poll?token=${encodeURIComponent(token)}`),
  confirmQrLogin: (token) => req("/api/auth/qr/confirm", { method: "POST", body: JSON.stringify({ token }) }),

  startCodeLogin: (phone) => req("/api/auth/code/start", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyCodeLogin: (phone, code) => req("/api/auth/code/verify", { method: "POST", body: JSON.stringify({ phone, code }) }),

  updateProfile: (id, patch) => req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listUsers: () => req("/api/users"),
  getUser: (id) => req(`/api/users/${id}`),
  setBlocked: (userId, blocked) =>
    req(`/api/users/${userId}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),
  getSharedMedia: (userId) => req(`/api/users/${userId}/shared-media`),

  listChats: () => req("/api/chats"),
  getChat: (id) => req(`/api/chats/${id}`),
  patchChat: (id, patch) => req(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChat: (id) => req(`/api/chats/${id}`, { method: "DELETE" }),
  deleteChatForMe: (id) => req(`/api/chats/${id}/delete-for-me`, { method: "POST" }),
  startDm: (userId, title, avatarColor) =>
    req("/api/chats", { method: "POST", body: JSON.stringify({ userId, title, avatarColor }) }),
  createChannel: (title, avatarImage, memberIds, adminIds) =>
    req("/api/chats/channels", { method: "POST", body: JSON.stringify({ title, avatarImage, memberIds, adminIds }) }),
  createGroup: (title, memberIds, avatarImage, adminIds) =>
    req("/api/chats/groups", { method: "POST", body: JSON.stringify({ title, memberIds, avatarImage, adminIds }) }),
  leaveChat: (id) => req(`/api/chats/${id}/leave`, { method: "POST" }),
  clearHistory: (id, forEveryone) =>
    req(`/api/chats/${id}/clear`, { method: "POST", body: JSON.stringify({ forEveryone: !!forEveryone }) }),
  setMemberRole: (id, userId, role) =>
    req(`/api/chats/${id}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),
  restrictMember: (id, userId, until) =>
    req(`/api/chats/${id}/restrict`, { method: "POST", body: JSON.stringify({ userId, until }) }),
  voteForGroup: (id) => req(`/api/chats/${id}/vote`, { method: "POST" }),

  listMessages: (chatId) => req(`/api/chats/${chatId}/messages`),
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
  sendTyping: (chatId) => req(`/api/chats/${chatId}/typing`, { method: "POST" }),
  getTyping: (chatId) => req(`/api/chats/${chatId}/typing`),

  listFolders: () => req("/api/folders"),
  createFolder: (name, chatIds) => req("/api/folders", { method: "POST", body: JSON.stringify({ name, chatIds }) }),
  patchFolder: (id, patch) => req(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteFolder: (id) => req(`/api/folders/${id}`, { method: "DELETE" }),

  listContacts: () => req("/api/contacts"),
  addContact: (userId) => req("/api/contacts", { method: "POST", body: JSON.stringify({ userId }) }),
  findUserByUsername: (username) => req(`/api/users/by-username/${encodeURIComponent(username.replace(/^@/, ""))}`),
  removeContact: (userId) => req("/api/contacts", { method: "DELETE", body: JSON.stringify({ userId }) }),

  getSettings: () => req("/api/settings"),
  patchSettings: (patch) => req("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  listSessions: () => req("/api/sessions"),

  listCalls: () => req("/api/calls"),
  placeCall: (chatId, kind) => req("/api/calls", { method: "POST", body: JSON.stringify({ chatId, kind }) }),
  patchCall: (id, patch) => req(`/api/calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addCallParticipant: (id, userId) =>
    req(`/api/calls/${id}/participants`, { method: "POST", body: JSON.stringify({ userId }) }),
  sendSignal: (callId, toUserId, kind, data) =>
    req(`/api/calls/${callId}/signal`, { method: "POST", body: JSON.stringify({ toUserId, kind, data }) }),
  pollSignals: (callId, after) => req(`/api/calls/${callId}/signal?after=${after}`),

  listBots: () => req("/api/bots"),
  createBot: (name, avatarImage, description) =>
    req("/api/bots", { method: "POST", body: JSON.stringify({ name, avatarImage, description }) }),
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

  listStories: () => req("/api/stories"),
  postStory: (kind, url) => req("/api/stories", { method: "POST", body: JSON.stringify({ kind, url }) }),
  viewStory: (id) => req(`/api/stories/${id}/view`, { method: "POST" }),
  deleteStory: (id) => req(`/api/stories/${id}`, { method: "DELETE" }),

  translateText: (text, target) => req("/api/translate", { method: "POST", body: JSON.stringify({ text, target }) }),
  translateBatch: (texts, target) => req("/api/translate/batch", { method: "POST", body: JSON.stringify({ texts, target }) }),

  getPremiumInfo: () => req("/api/premium/me"),
  requestPremium: () => req("/api/premium/request", { method: "POST" }),
  grantPremium: (userId, premium = true) =>
    req("/api/premium/grant", { method: "POST", body: JSON.stringify({ userId, premium }) }),

  listGifts: () => req("/api/gifts"),
  requestGift: (giftId, recipientId) =>
    req("/api/gifts/request", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),

  getAdsInfo: () => req("/api/ads/me"),
  requestAds: () => req("/api/ads/request", { method: "POST" }),
  setAdContent: (text, url, attachment) => req("/api/ads/content", { method: "PUT", body: JSON.stringify({ text, url, attachment }) }),
  deliverGift: (giftId, recipientId) =>
    req("/api/gifts/deliver", { method: "POST", body: JSON.stringify({ giftId, recipientId }) }),
};
