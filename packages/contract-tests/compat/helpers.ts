// Общее для генератора фикстуры совместимости и для теста, который её читает.
// Всё — через публичный API, как у контрактных тестов; прямой доступ к SQLite
// есть только в schema.test.ts и при сборке фикстуры (см. README.md).
import { createHash } from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";
import { Api, type ApiResponse } from "../support/client";

export const COMPAT_DIR = import.meta.dirname;
export const FIXTURE_DIR = path.join(COMPAT_DIR, "fixture");
export const MANIFEST_PATH = path.join(COMPAT_DIR, "fixture.manifest.json");

export type UserKey = "alice" | "bob" | "carol";

export interface ManifestUser {
  key: UserKey;
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  username: string;
  /** device_id того «устройства», к которому привязан секретный чат. */
  deviceId: string;
}

export interface ManifestFile {
  url: string;
  /** Откуда файл: original — загружен тестом, generated — превью, сделанное сервером. */
  origin: "original" | "generated";
  kind?: string;
  name?: string;
  size: number;
  sha256: string;
  /** Кто из пользователей точно видит файл (участник чата с ним). */
  viewer: UserKey;
  /** Кто точно НЕ видит файл (не участник ни одного чата с ним). */
  outsider?: UserKey;
  /** Сжат ли файл brotli на диске (такие отдаются без Range). */
  compressed: boolean;
  /** Номер ключа из crypto_keys (purpose = files), которым зашифрован файл на диске. */
  keyId: number | null;
}

export interface Manifest {
  generatedAt: string;
  note: string;
  /** Мастер-ключи, с которыми сервер писал фикстуру (те же, что TEST_KEYS в support/env.ts). */
  env: { MESSAGES_KEY: string; UPLOADS_KEY: string; KEY_ROTATION_SECONDS: string };
  users: ManifestUser[];
  chats: Record<string, { id: string; type: string; members: UserKey[] }>;
  /** Именованные сообщения — для понятных проверок (текст, правка, ответ, реакции, опрос). */
  messages: Record<
    string,
    {
      id: string;
      chat: string;
      sender: UserKey;
      text: string;
      /** Текст до правки (если сообщение правили). */
      originalText?: string;
      replyTo?: string;
      reactions?: Array<{ emoji: string; users: UserKey[] }>;
      poll?: { options: string[]; votes: number[]; voters: UserKey[][] };
      files?: string[];
    }
  >;
  files: ManifestFile[];
  /** Повторная загрузка тех же байтов вернула тот же url (sha_… — дедупликация). */
  dedup: { first: string; second: string };
  /** Полный снимок: что видит каждый пользователь в списке чатов и в каждом чате. */
  snapshot: {
    chatLists: Record<UserKey, ChatSnapshot[]>;
    chatMessages: Record<string, { viewer: UserKey; messages: MessageSnapshot[] }>;
  };
  /** Статистика по ключам шифрования — фикстура должна покрывать несколько ротаций. */
  crypto: {
    keys: Array<{ id: number; purpose: string; createdAt: string }>;
    messageTextKeyIds: number[];
    fileKeyIds: number[];
    secretChatKeys: number;
  };
  searches: Array<{ viewer: UserKey; chat: string; q: string; expectIds: string[] }>;
}

export type ChatSnapshot = ReturnType<typeof snapshotChat>;
export type MessageSnapshot = ReturnType<typeof snapshotMessage>;

/** Устойчивые поля чата: то, что не меняется от чтения/активности. */
export function snapshotChat(c: any) {
  return {
    id: c.id as string,
    type: c.type as string,
    title: c.title ?? null,
    ownerId: c.ownerId ?? null,
    ownerIds: [...(c.ownerIds ?? [])].sort(),
    adminIds: [...(c.adminIds ?? [])].sort(),
    memberIds: [...(c.memberIds ?? [])].sort(),
    createdAt: c.createdAt as string,
    linkedDiscussionChatId: c.linkedDiscussionChatId ?? null,
    secret: c.secret ?? false,
  };
}

/** Устойчивые поля сообщения: без readByIds/readAt/views — они меняются от самого чтения. */
export function snapshotMessage(m: any) {
  return {
    id: m.id as string,
    chatId: m.chatId as string,
    senderId: m.senderId as string,
    type: m.type as string,
    text: m.text ?? null,
    createdAt: m.createdAt as string,
    editedAt: m.editedAt ?? null,
    pinned: !!m.pinned,
    replyToId: m.replyToId ?? null,
    threadRootId: m.threadRootId ?? null,
    anchorForPostId: m.anchorForPostId ?? null,
    discussionAnchorId: m.discussionAnchorId ?? null,
    forwardedFrom: m.forwardedFrom ?? null,
    attachments: m.attachments ?? null,
    reactions: m.reactions ?? [],
    mentionedUserIds: m.mentionedUserIds ?? [],
    deletedForIds: m.deletedForIds ?? [],
  };
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function check(res: ApiResponse, what: string) {
  if (res.status !== 200) throw new Error(`${what}: ${res.status} ${res.text.slice(0, 500)}`);
  return res.body;
}

/** Вход с заданного устройства: device_id задаём заранее, сервер берёт его из cookie. */
export async function loginOnDevice(baseUrl: string, user: Pick<ManifestUser, "email" | "password" | "deviceId">): Promise<{ api: Api; self: any }> {
  const api = new Api(baseUrl);
  api.cookies.set("device_id", user.deviceId);
  const body = check(await api.post("/api/auth/login-email", { email: user.email, password: user.password }), `вход ${user.email}`);
  if (api.cookies.get("device_id") !== user.deviceId) throw new Error("сервер сменил device_id при входе");
  return { api, self: body.user };
}

export function upload(api: Api, bytes: Uint8Array, query: { kind: string; name: string; mimeType?: string }) {
  return api.request("POST", "/api/uploads", {
    query,
    headers: { "content-type": "application/octet-stream" },
    body: new Blob([new Uint8Array(bytes)]),
  });
}

export async function download(api: Api, url: string, headers: Record<string, string> = {}) {
  const res = await fetch(new URL(url, api.baseUrl), { headers: { ...headers, cookie: api.cookieHeader() }, redirect: "manual" });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}

/** Все сообщения чата (до 200 — фикстура маленькая). */
export async function listMessages(api: Api, chatId: string): Promise<any[]> {
  return check(await api.get(`/api/chats/${chatId}/messages`, { query: { limit: 200 } }), `сообщения ${chatId}`).messages;
}

/** Все ссылки на /uploads/ во вложениях сообщения. */
export function uploadUrlsOf(m: any): string[] {
  const out: string[] = [];
  for (const a of m.attachments ?? []) {
    for (const k of ["url", "thumbUrl", "previewUrl", "posterUrl"]) {
      if (typeof a?.[k] === "string" && a[k].startsWith("/uploads/")) out.push(a[k]);
    }
  }
  return out;
}

/** Детерминированные «случайные» байты (xorshift): brotli их не сжимает. */
export function pseudoRandomBytes(size: number, seed: number): Buffer {
  const out = Buffer.alloc(size);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

/** Настоящий PNG w×h с градиентом — его понимает sharp, сервер строит из него превью. */
export function makePng(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // глубина
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      raw[row + 1 + x * 3] = (x * 255) / w;
      raw[row + 2 + x * 3] = (y * 255) / h;
      raw[row + 3 + x * 3] = ((x ^ y) * 7) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
