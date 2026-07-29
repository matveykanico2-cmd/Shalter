import type { Bot, Call, CallSignal, Chat, Contact, Folder, Message, Session, Settings, PublicUser } from "../types";
import type { ChatSummary } from "../data/chat-summary";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  session: () => req<{ user: PublicUser | null; accounts: PublicUser[] }>("/api/auth/session"),
  sendCode: (phone: string) => req<{ ok: boolean; demoCode: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyCode: (phone: string, code: string) =>
    req<{ user: PublicUser; isNew: boolean }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ phone, code }) }),
  registerEmail: (name: string, email: string, password: string) =>
    req<{ user: PublicUser }>("/api/auth/register-email", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  loginEmail: (email: string, password: string) =>
    req<{ user: PublicUser }>("/api/auth/login-email", { method: "POST", body: JSON.stringify({ email, password }) }),
  switchAccount: (userId: string) =>
    req<{ user: PublicUser }>("/api/auth/switch", { method: "POST", body: JSON.stringify({ userId }) }),
  logout: (uid?: string) =>
    req<{ ok: boolean; remaining: string[] }>("/api/auth/logout", { method: "POST", body: JSON.stringify({ uid }) }),

  updateProfile: (id: string, patch: Partial<PublicUser>) =>
    req<{ user: PublicUser }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listUsers: () => req<{ users: PublicUser[] }>("/api/users"),
  setBlocked: (userId: string, blocked: boolean) =>
    req<{ user: PublicUser }>(`/api/users/${userId}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),

  listChats: () => req<{ chats: ChatSummary[] }>("/api/chats"),
  getChat: (id: string) => req<{ chat: ChatSummary; members: PublicUser[] }>(`/api/chats/${id}`),
  patchChat: (id: string, patch: Partial<Chat>) =>
    req<{ chat: Chat }>(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChat: (id: string) => req<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
  startDm: (userId: string, title: string, avatarColor: string) =>
    req<{ chat: Chat }>("/api/chats", { method: "POST", body: JSON.stringify({ userId, title, avatarColor }) }),
  leaveChat: (id: string) => req<{ ok: boolean }>(`/api/chats/${id}/leave`, { method: "POST" }),
  clearHistory: (id: string) => req<{ ok: boolean }>(`/api/chats/${id}/clear`, { method: "POST" }),
  setMemberRole: (id: string, userId: string, role: "kick" | "promote" | "demote") =>
    req<{ chat: Chat }>(`/api/chats/${id}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),

  listMessages: (chatId: string) => req<{ messages: Message[] }>(`/api/chats/${chatId}/messages`),
  sendMessage: (
    chatId: string,
    text: string,
    opts?: { replyToId?: string | null; attachments?: Message["attachments"]; forwardedFrom?: Message["forwardedFrom"] }
  ) =>
    req<{ message: Message }>(`/api/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, ...opts }),
    }),
  editMessage: (chatId: string, messageId: string, text: string) =>
    req<{ message: Message }>(`/api/chats/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  deleteMessage: (chatId: string, messageId: string) =>
    req<{ message: Message }>(`/api/chats/${chatId}/messages/${messageId}`, { method: "DELETE" }),
  react: (chatId: string, messageId: string, emoji: string) =>
    req<{ message: Message }>(`/api/chats/${chatId}/messages/${messageId}/react`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }),
  pinMessage: (chatId: string, messageId: string, pinned: boolean) =>
    req<{ message: Message }>(`/api/chats/${chatId}/messages/${messageId}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned }),
    }),
  sendTyping: (chatId: string) => req<{ ok: boolean }>(`/api/chats/${chatId}/typing`, { method: "POST" }),
  getTyping: (chatId: string) => req<{ typingUserId: string | null }>(`/api/chats/${chatId}/typing`),

  listFolders: () => req<{ folders: Folder[] }>("/api/folders"),
  createFolder: (name: string, chatIds: string[]) =>
    req<{ folder: Folder }>("/api/folders", { method: "POST", body: JSON.stringify({ name, chatIds }) }),
  patchFolder: (id: string, patch: Partial<Folder>) =>
    req<{ folder: Folder }>(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteFolder: (id: string) => req<{ ok: boolean }>(`/api/folders/${id}`, { method: "DELETE" }),

  listContacts: () => req<{ contacts: (Contact & { user: PublicUser })[] }>("/api/contacts"),
  addContact: (userId: string) =>
    req<{ contact: Contact }>("/api/contacts", { method: "POST", body: JSON.stringify({ userId }) }),
  removeContact: (userId: string) =>
    req<{ ok: boolean }>("/api/contacts", { method: "DELETE", body: JSON.stringify({ userId }) }),

  getSettings: () => req<{ settings: Settings }>("/api/settings"),
  patchSettings: (patch: Partial<Settings>) =>
    req<{ settings: Settings }>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  listSessions: () => req<{ sessions: Session[] }>("/api/sessions"),
  removeSession: (id: string) => req<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),

  listCalls: () => req<{ calls: (Call & { otherUser: PublicUser | null })[] }>("/api/calls"),
  placeCall: (chatId: string, kind: "audio" | "video") =>
    req<{ call: Call }>("/api/calls", { method: "POST", body: JSON.stringify({ chatId, kind }) }),
  patchCall: (id: string, patch: Partial<Call>) =>
    req<{ call: Call }>(`/api/calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  sendSignal: (callId: string, toUserId: string, kind: CallSignal["kind"], data: unknown) =>
    req<{ signal: CallSignal }>(`/api/calls/${callId}/signal`, {
      method: "POST",
      body: JSON.stringify({ toUserId, kind, data }),
    }),
  pollSignals: (callId: string, after: number) =>
    req<{ signals: CallSignal[] }>(`/api/calls/${callId}/signal?after=${after}`),

  listBots: () => req<{ bots: Bot[] }>("/api/bots"),

  search: (q: string) =>
    req<{ chats: Chat[]; users: PublicUser[]; messages: Message[] }>(`/api/search?q=${encodeURIComponent(q)}`),
};
