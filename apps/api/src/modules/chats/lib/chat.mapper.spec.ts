// toChat и ChatsRepository обязаны читать и писать то же, что server/data/chats.js: пока
// сообщения, темы и боты в server/, один и тот же чат читают и меняют оба бэкенда. Старый
// сервер в отдельном процессе (server/db.js открывает cwd/data) заводит чаты в разных
// состояниях и отдаёт строки таблиц вместе со своим результатом; здесь те же строки проходят
// через перенесённый код, а репозиторий работает с той же базой.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../db/db.module.js";
import * as schema from "../../db/schema.js";
import { ChatsRepository } from "../chats.repository.js";
import type { ChatMemberRow, ChatPatch, ChatRow, NewChat } from "../model/domain.js";
import { toChat } from "./chat.mapper.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const TEST_KEYS = {
  MESSAGES_KEY: "6d657373616765732d6b65792d666f722d636f6e74726163742d74657374732d",
  UPLOADS_KEY: "75706c6f6164732d6b65792d666f722d636f6e74726163742d74657374732d21",
};

// Одна и та же правка и один и тот же новый чат — у старого кода и у репозитория.
const PATCH = {
  title: "Новое",
  description: null,
  isPublic: true,
  approveJoins: false,
  signMessages: true,
  topicsEnabled: true,
  points: 5,
  autoDeleteSeconds: undefined,
  slowModeSeconds: null,
  welcomeText: "Привет, {name}",
  permissions: { sendMessages: false },
  memberTitles: { u_b: "кот" },
  restrictions: { u_c: "forever" },
  votes: { u_a: "2026-01-01T00:00:00.000Z" },
  protectedBy: [],
  bannedIds: ["u_x"],
  wallpaper: null,
  allowedReactions: ["👍"],
  memberIds: ["u_a", "u_b", "u_c", "u_d"],
  adminIds: ["u_b"],
  ownerIds: ["u_a", "u_b"],
  ownerId: "u_b",
} satisfies ChatPatch;
const NEW_CHAT = {
  type: "channel",
  title: "Канал",
  description: "О канале",
  username: "chan",
  isPublic: true,
  avatarColor: "#D9822E",
  avatarImage: "/uploads/x.png",
  ownerId: "u_a",
  memberIds: ["u_a", "u_b", "u_a"],
  adminIds: ["u_a", "u_b"],
  pinned: false,
  muted: false,
  archived: false,
  linkedDiscussionChatId: "c_disc",
  createdAt: "2026-02-02T00:00:00.000Z",
} satisfies Omit<NewChat, "id">;

const SEED_SCRIPT = `
const server = ${JSON.stringify(path.join(REPO_ROOT, "server"))};
const db = require(server + "/db.js");
const chats = require(server + "/data/chats.js");
const PATCH = ${JSON.stringify(PATCH)};
PATCH.autoDeleteSeconds = undefined;
const NEW_CHAT = ${JSON.stringify(NEW_CHAT)};
(async () => {
  const base = { pinned: false, muted: false, archived: false, createdAt: "2026-01-01T00:00:00.000Z" };
  await chats.createChat({ ...base, id: "c_dm", type: "dm", title: "", memberIds: ["u_a", "u_b"] });
  await chats.createChat({ ...base, id: "c_self", type: "dm", title: "", memberIds: ["u_a"] });
  await chats.createChat({ ...base, id: "c_secret", type: "dm", title: "", memberIds: ["u_a", "u_b"], secret: true, secretDevices: { u_a: "dev-a" } });
  await chats.createChat({ ...base, id: "c_group", type: "group", title: "Группа", avatarColor: "#2E56D9", memberIds: ["u_a", "u_b", "u_c"], ownerId: "u_a", adminIds: ["u_a", "u_b"] });
  await chats.updateChat("c_group", { moderatorIds: ["u_c"], memberTitles: { u_b: "зам" }, restrictions: { u_c: "2999-01-01T00:00:00.000Z" }, bannedIds: ["u_x"], permissions: { sendMedia: false }, slowModeSeconds: 30, welcomeText: "Hi", inviteCode: "INVITE123", approveJoins: true, anonymousAdmins: true, points: 12, votes: { u_b: "2026-01-02T00:00:00.000Z" }, autoDeleteSeconds: 86400 });
  await chats.createChat({ ...base, id: "c_channel", type: "channel", title: "Канал", username: "MyChan", isPublic: true, memberIds: ["u_a", "u_b"], ownerId: "u_a", adminIds: ["u_a"], linkedDiscussionChatId: "c_group" });
  await chats.updateChat("c_channel", { commentsOff: true, signMessages: true, commentPriceStars: 7, allowedReactions: ["🔥", "👍"], wallpaper: { kind: "color", value: "#000" }, isVerified: true, mutedUntil: "2999-01-01T00:00:00.000Z" });
  await chats.createChat({ ...base, id: "c_broken", type: "group", title: "Сломан", memberIds: ["u_a"] });
  db.prepare("UPDATE chats SET permissions = '{', memberTitles = 'x', restrictions = '[', votes = 'oops', bannedIds = '', protectedBy = '{', wallpaper = 'null', allowedReactions = '[1' WHERE id = 'c_broken'").run();
  await chats.createChat({ ...base, id: "c_w1", type: "group", title: "Правка", memberIds: ["u_a", "u_b"], ownerId: "u_a" });
  await chats.createChat({ ...base, id: "c_w2", type: "group", title: "Правка", memberIds: ["u_a", "u_b"], ownerId: "u_a" });
  await chats.updateChat("c_w1", PATCH);
  await chats.createChat({ ...NEW_CHAT, id: "c_new1" });

  const read = [];
  for (const row of db.prepare("SELECT * FROM chats WHERE id NOT IN ('c_w1', 'c_w2', 'c_new1')").all()) {
    const members = db.prepare("SELECT * FROM chat_members WHERE chatId = ?").all(row.id);
    read.push({ row, members, chat: await chats.getChat(row.id) });
  }
  const lookups = {
    forA: await chats.listChatsForUser("u_a"),
    forAOnDevA: await chats.listChatsForUser("u_a", { deviceId: "dev-a" }),
    forAOnOther: await chats.listChatsForUser("u_a", { deviceId: "dev-x" }),
    forBNoDevice: await chats.listChatsForUser("u_b", { deviceId: null }),
    dm: await chats.findDmBetween("u_b", "u_a"),
    self: await chats.findDmBetween("u_a", "u_a"),
    byUsername: await chats.findChatByUsername(" mychan "),
    byInvite: await chats.findChatByInviteCode("INVITE123"),
    channelOfGroup: await chats.findChannelByDiscussionChatId("c_group"),
  };
  db.close();
  require("fs").writeFileSync(process.env.SEED_OUT, JSON.stringify({ read, lookups }));
})();
`;

interface Seeded {
  read: { row: ChatRow; members: ChatMemberRow[]; chat: unknown }[];
  lookups: Record<string, unknown>;
}

let dir: string;
let seeded: Seeded;
let sqlite: BetterSqlite3.Database;
let repo: ChatsRepository;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-chats-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "seed.json");
  execFileSync(process.execPath, ["-e", SEED_SCRIPT], {
    cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: "test", SEED_OUT: out, ...TEST_KEYS },
    stdio: "ignore",
  });
  seeded = JSON.parse(fs.readFileSync(out, "utf8"));
  const Database = createRequire(path.join(REPO_ROOT, "server", "db.js"))("better-sqlite3") as typeof BetterSqlite3;
  sqlite = new Database(path.join(dir, "data", "app.db"));
  repo = new ChatsRepository(drizzle({ client: sqlite, schema }) as Db);
});
afterAll(() => {
  sqlite?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Как в HTTP-ответе: undefined-поля пропадают.
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));
const rowOf = (id: string) => {
  const { id: _id, ...row } = sqlite.prepare("SELECT * FROM chats WHERE id = ?").get(id) as ChatRow;
  return row;
};
const membersOf = (id: string) =>
  sqlite.prepare("SELECT userId, isAdmin, isModerator, isOwner FROM chat_members WHERE chatId = ? ORDER BY userId").all(id);

describe("чат совпадает с server/data/chats.js", () => {
  it("заведены все состояния", () => {
    expect(seeded.read.map((s) => s.row.id).sort()).toEqual(["c_broken", "c_channel", "c_dm", "c_group", "c_secret", "c_self"]);
  });

  it("toChat = rowToChat", () => {
    for (const s of seeded.read) expect(asJson(toChat(s.row, s.members)), s.row.id).toEqual(s.chat);
  });

  it("чтение репозиторием", () => {
    for (const s of seeded.read) expect(asJson(repo.findById(s.row.id)), s.row.id).toEqual(s.chat);
    const { lookups } = seeded;
    // Списки сняты после правки c_w1: здесь — до правки c_w2 и создания c_new2 (тесты идут по порядку).
    expect(asJson(repo.findForUser("u_a"))).toEqual(lookups.forA);
    expect(asJson(repo.findForUser("u_a", "dev-a"))).toEqual(lookups.forAOnDevA);
    expect(asJson(repo.findForUser("u_a", "dev-x"))).toEqual(lookups.forAOnOther);
    expect(asJson(repo.findForUser("u_b", null))).toEqual(lookups.forBNoDevice);
    expect(asJson(repo.findDmBetween("u_b", "u_a"))).toEqual(lookups.dm);
    expect(asJson(repo.findDmBetween("u_a", "u_a"))).toEqual(lookups.self);
    expect(asJson(repo.findByUsername(" mychan "))).toEqual(lookups.byUsername);
    expect(asJson(repo.findByInviteCode("INVITE123"))).toEqual(lookups.byInvite);
    expect(asJson(repo.findChannelByDiscussion("c_group"))).toEqual(lookups.channelOfGroup);
  });

  it("правка пишет те же строки, что updateChat", () => {
    repo.update("c_w2", PATCH);
    expect(rowOf("c_w2")).toEqual(rowOf("c_w1"));
    expect(membersOf("c_w2")).toEqual(membersOf("c_w1"));
  });

  it("создание пишет те же строки, что createChat", () => {
    repo.create({ ...NEW_CHAT, id: "c_new2" });
    expect(rowOf("c_new2")).toEqual(rowOf("c_new1"));
    expect(membersOf("c_new2")).toEqual(membersOf("c_new1"));
  });

  it("секретный чат привязывается к первому открывшему его устройству", () => {
    expect(repo.isSecret("c_secret")).toBe(true);
    expect(repo.claimSecretDevice("c_secret", "u_a", "dev-x")).toBe(false);
    expect(repo.claimSecretDevice("c_secret", "u_a", "dev-a")).toBe(true);
    expect(repo.claimSecretDevice("c_secret", "u_b", undefined)).toBe(false);
    expect(repo.claimSecretDevice("c_secret", "u_b", "dev-b")).toBe(true);
    expect(repo.claimSecretDevice("c_secret", "u_b", "dev-c")).toBe(false);
    expect(repo.claimSecretDevice("c_group", "u_a", undefined)).toBe(true);
  });
});
