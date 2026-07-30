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
  sendCode: (phone) => req("/api/auth/login", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyCode: (phone, code) => req("/api/auth/verify", { method: "POST", body: JSON.stringify({ phone, code }) }),
  registerEmail: (name, email, password) =>
    req("/api/auth/register-email", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  loginEmail: (email, password) =>
    req("/api/auth/login-email", { method: "POST", body: JSON.stringify({ email, password }) }),
  switchAccount: (userId) => req("/api/auth/switch", { method: "POST", body: JSON.stringify({ userId }) }),
  logout: (uid) => req("/api/auth/logout", { method: "POST", body: JSON.stringify({ uid }) }),

  updateProfile: (id, patch) => req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listUsers: () => req("/api/users"),
  setBlocked: (userId, blocked) =>
    req(`/api/users/${userId}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),

  listChats: () => req("/api/chats"),
  getChat: (id) => req(`/api/chats/${id}`),
  patchChat: (id, patch) => req(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChat: (id) => req(`/api/chats/${id}`, { method: "DELETE" }),
  startDm: (userId, title, avatarColor) =>
    req("/api/chats", { method: "POST", body: JSON.stringify({ userId, title, avatarColor }) }),
  createChannel: (title, avatarImage) =>
    req("/api/chats/channels", { method: "POST", body: JSON.stringify({ title, avatarImage }) }),
  createGroup: (title, memberIds, avatarImage) =>
    req("/api/chats/groups", { method: "POST", body: JSON.stringify({ title, memberIds, avatarImage }) }),
  leaveChat: (id) => req(`/api/chats/${id}/leave`, { method: "POST" }),
  clearHistory: (id, forEveryone) =>
    req(`/api/chats/${id}/clear`, { method: "POST", body: JSON.stringify({ forEveryone: !!forEveryone }) }),
  setMemberRole: (id, userId, role) =>
    req(`/api/chats/${id}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),

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
  removeContact: (userId) => req("/api/contacts", { method: "DELETE", body: JSON.stringify({ userId }) }),

  getSettings: () => req("/api/settings"),
  patchSettings: (patch) => req("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  listSessions: () => req("/api/sessions"),
  removeSession: (id) => req(`/api/sessions/${id}`, { method: "DELETE" }),

  listCalls: () => req("/api/calls"),
  placeCall: (chatId, kind) => req("/api/calls", { method: "POST", body: JSON.stringify({ chatId, kind }) }),
  patchCall: (id, patch) => req(`/api/calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addCallParticipant: (id, userId) =>
    req(`/api/calls/${id}/participants`, { method: "POST", body: JSON.stringify({ userId }) }),
  sendSignal: (callId, toUserId, kind, data) =>
    req(`/api/calls/${callId}/signal`, { method: "POST", body: JSON.stringify({ toUserId, kind, data }) }),
  pollSignals: (callId, after) => req(`/api/calls/${callId}/signal?after=${after}`),

  listBots: () => req("/api/bots"),

  search: (q) => req(`/api/search?q=${encodeURIComponent(q)}`),

  publishPost: (channelId, text, attachments) =>
    req(`/api/posts/${channelId}/publish`, { method: "POST", body: JSON.stringify({ text, attachments }) }),
};
