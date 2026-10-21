// toUser, publicUser и selfUser обязаны отдавать то же, что server/data/users.js (rowToUser)
// и server/data/sanitize.js: пока часть маршрутов в server/, клиент получает пользователя
// от обоих бэкендов. Старый сервер в отдельном процессе (server/db.js открывает cwd/data)
// заводит пользователей с разными состояниями и отдаёт строки таблицы вместе со своим
// результатом — здесь те же строки проходят через перенесённый код.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserRow } from "../model/domain.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const ADMIN_PHONE = "+70000000001";
const TEST_KEYS = {
  MESSAGES_KEY: "6d657373616765732d6b65792d666f722d636f6e74726163742d74657374732d",
  UPLOADS_KEY: "75706c6f6164732d6b65792d666f722d636f6e74726163742d74657374732d21",
};

const SEED_SCRIPT = `
const server = ${JSON.stringify(path.join(REPO_ROOT, "server"))};
const db = require(server + "/db.js");
const users = require(server + "/data/users.js");
const { publicUser, selfUser } = require(server + "/data/sanitize.js");
(async () => {
  const base = { bio: "", online: true, lastSeen: "2026-01-01T00:00:00.000Z" };
  await users.createUser({ ...base, id: "u_plain", name: "Аня", username: "anya", phone: "+79990000001", email: "a@x.ru", passwordHash: "h", passwordSalt: "s" });
  await users.createUser({ ...base, id: "u_admin", name: "Админ", username: "boss", phone: ${JSON.stringify(ADMIN_PHONE)}, premiumUntil: "9999-01-01T00:00:00.000Z" });
  await users.createUser({ ...base, id: "u_bot", name: "Бот", username: "some_bot", phone: "", isBot: true });
  await users.createUser({ ...base, id: "u_rich", name: "Богач", username: "rich", phone: "+79990000003", premiumUntil: "2999-01-01T00:00:00.000Z", birthday: "1990-05-06" });
  await users.createUser({ ...base, id: "u_banned", name: "Бан", username: "banned", phone: "+79990000004" });
  await users.createUser({ ...base, id: "u_ban_over", name: "Был в бане", username: "was_banned", phone: "+79990000005" });
  await users.createUser({ ...base, id: "u_broken", name: "Сломан", username: "broken", phone: "+79990000006" });

  await users.updateUser("u_rich", { lastName: "Петров", nameColor: "#ff0000", adsUntil: "9999-01-01T00:00:00.000Z", adText: "Реклама", businessUntil: "2999-01-01T00:00:00.000Z", businessLat: 55.75, businessLng: 37.61 });
  await users.updateUser("u_plain", { nameColor: "#00ff00" });
  await users.setBanned("u_banned", true, "спам", "2999-01-01T00:00:00.000Z");
  await users.setBanned("u_ban_over", true, "давно", "2000-01-01T00:00:00.000Z");
  await users.setStatusState("u_rich", [{ id: "st1", image: "/s.png", name: "Отпуск" }], "st1");
  await users.setProfileTracks("u_rich", [{ url: "/a.mp3" }, { url: "/b.mp3" }]);
  await users.addReceivedGift("u_rich", { emoji: "🎁", fromId: "u_plain", anon: true, at: "2026-01-01T00:00:00.000Z" });
  await users.addReceivedGift("u_rich", { emoji: "🌹", fromId: "u_plain", at: "2026-01-02T00:00:00.000Z" });
  await users.setAvatars("u_rich", [{ url: "/uploads/a_0123456789abcdef.jpg", kind: "image", poster: "data:image/png;base64,AA==" }]);
  await users.setVerified("u_rich", true);
  await users.setDeveloper("u_rich", true);
  await users.setAdminSections("u_rich", ["moderation"]);
  await users.setSafetyLabel("u_rich", "scam");
  await users.startTotpSetup("u_rich", "SECRET");
  await users.enableTotp("u_rich", ["hash1", "hash2"]);
  await users.updateUser("u_plain", { twoFactorMethod: "password", cloudPasswordHash: "ch", cloudPasswordSalt: "cs", cloudPasswordHint: "кот" });
  users.scheduleAccountDeletion("u_plain", "2999-01-01T00:00:00.000Z");
  db.prepare("UPDATE users SET blockedUserIds = 'not json', giftsReceived = '{', adminSections = 'x', statusItems = '{\\"a\\":1}', activeStatusId = 'a', profileTrack = '{\\"url\\":\\"/one.mp3\\"}', avatarImages = '[1, {\\"url\\": 5}]', profileBanner = 'oops' WHERE id = 'u_broken'").run();

  const out = [];
  for (const row of db.prepare("SELECT * FROM users WHERE id LIKE 'u\\\\_%' ESCAPE '\\\\'").all()) {
    const user = await users.getUser(row.id);
    out.push({ row, user, publicUser: publicUser(user), selfUser: selfUser(user) });
  }
  db.close();
  require("fs").writeFileSync(process.env.SEED_OUT, JSON.stringify(out));
})();
`;

interface Seeded {
  row: UserRow;
  user: unknown;
  publicUser: unknown;
  selfUser: unknown;
}

let dir: string;
let seeded: Seeded[];
let mapper: typeof import("./user.mapper.js");
let presenter: typeof import("./user.presenter.js");

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-users-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "seed.json");
  execFileSync(process.execPath, ["-e", SEED_SCRIPT], {
    cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: "test", SEED_OUT: out, PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ...TEST_KEYS },
    stdio: "ignore",
  });
  seeded = JSON.parse(fs.readFileSync(out, "utf8"));
  // Админ определяется по окружению при загрузке модуля — тот же номер, что у старого сервера.
  process.env.PREMIUM_ADMIN_PHONE = ADMIN_PHONE;
  mapper = await import("./user.mapper.js");
  presenter = await import("./user.presenter.js");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Как в HTTP-ответе: undefined-поля пропадают.
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("пользователь совпадает с server/data/users.js и sanitize.js", () => {
  it("заведены все состояния", () => {
    expect(seeded.map((s) => s.row.id).sort()).toEqual(["u_admin", "u_ban_over", "u_banned", "u_bot", "u_broken", "u_plain", "u_rich"]);
  });

  it("toUser = rowToUser", () => {
    for (const s of seeded) expect(asJson(mapper.toUser(s.row)), s.row.id).toEqual(s.user);
  });

  it("publicUser и selfUser", () => {
    for (const s of seeded) {
      const user = mapper.toUser(s.row);
      expect(asJson(presenter.publicUser(user)), s.row.id).toEqual(s.publicUser);
      expect(asJson(presenter.selfUser(user)), s.row.id).toEqual(s.selfUser);
    }
  });
});
