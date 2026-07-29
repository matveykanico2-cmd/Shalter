export type ChatType = "dm" | "group" | "channel" | "secret" | "bot";

export interface User {
  id: string;
  name: string;
  username: string;
  phone: string;
  email?: string;
  passwordHash?: string;
  passwordSalt?: string;
  avatarColor: string;
  avatarImage?: string; // data URL, uploaded photo
  bio: string;
  online: boolean;
  lastSeen: string; // ISO
  isBot?: boolean;
  blockedUserIds?: string[];
}

// What the server is allowed to send to the client — never the password fields.
export type PublicUser = Omit<User, "passwordHash" | "passwordSalt">;

export interface Chat {
  id: string;
  type: ChatType;
  title: string;
  description?: string;
  avatarColor: string;
  memberIds: string[];
  ownerId?: string;
  adminIds?: string[];
  username?: string; // public handle for groups/channels
  isPublic?: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  draft?: string;
  secretTimer?: number | null; // seconds, secret chats only
  linkedDiscussionChatId?: string; // channels
  createdAt: string;
}

export interface Attachment {
  kind: "image" | "file" | "voice" | "video-note" | "poll" | "location" | "contact";
  name?: string;
  size?: number;
  durationSec?: number;
  url?: string; // data URL — recorded/uploaded media, kept inline (no object storage)
  mimeType?: string;
  meta?: Record<string, unknown>;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: "text" | "system" | "call" | "poll";
  text: string;
  createdAt: string;
  editedAt?: string | null;
  deleted?: boolean;
  replyToId?: string | null;
  pinned: boolean;
  reactions: Reaction[];
  attachments?: Attachment[];
  readByIds: string[];
  views?: number; // channel posts
  keyboard?: { text: string; action: string }[][]; // bot inline keyboard
  forwardedFrom?: { chatId: string; chatTitle: string; senderId: string; senderName: string };
}

export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  chatIds: string[];
  order: number;
}

export interface Contact {
  id: string;
  ownerId: string;
  userId: string;
  addedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  device: string;
  browser: string;
  city: string;
  lastActive: string;
  current: boolean;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  accent: string;
  fontSize: number;
  notifications: {
    previewText: boolean;
    sound: boolean;
    mutedChatIds: string[];
  };
  privacy: {
    lastSeen: "everyone" | "contacts" | "nobody";
    phone: "everyone" | "contacts" | "nobody";
    photo: "everyone" | "contacts" | "nobody";
  };
  chatWallpaper: string;
  autoDownload: boolean;
}

export interface Call {
  id: string;
  chatId: string;
  kind: "audio" | "video";
  direction: "incoming" | "outgoing";
  callerId: string;
  participantIds: string[];
  status: "missed" | "completed" | "ongoing" | "declined";
  startedAt: string;
  durationSec: number;
}

export interface Bot {
  id: string;
  userId: string;
  description: string;
  commands: { command: string; description: string }[];
}

// WebRTC signaling exchanged over HTTP polling (no WebSocket server here).
export interface CallSignal {
  id: string;
  seq: number;
  callId: string;
  fromUserId: string;
  toUserId: string;
  kind: "offer" | "answer" | "ice" | "end";
  data: unknown;
  createdAt: string;
}
