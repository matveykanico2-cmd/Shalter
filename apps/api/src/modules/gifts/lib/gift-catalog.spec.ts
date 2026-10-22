// Каталог подарков обязан совпадать с server/data/gifts.js, а фон подарка — с
// server/lib/giftBackground.js: подарки продают и вручают оба бэкенда (оплаченные донатом —
// server/lib/fulfillOrder.js). Старый сервер в отдельном процессе (server/db.js открывает
// cwd/data) правит каталог и отдаёт строки gift_catalog вместе со своим результатом — здесь
// те же строки проходят через перенесённый код.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GiftCatalogService } from "../gift-catalog.service.js";
import type { GiftsRepository } from "../gifts.repository.js";
import type { GiftCatalogRow } from "../model/domain.js";
import { sanitizeGiftBackground } from "./gift-background.js";
import { BUILTIN_GIFTS, conversionValue, ON_SALE_IDS, STARS_PER_RUB, SUPPLY_MAX, SUPPLY_MIN } from "./gift-catalog.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const BACKGROUNDS = [
  { from: "#FFF", to: " #00ff00 ", pattern: "#123456", symbol: "star1" },
  { from: "#fff", to: "#000", pattern: "red", symbol: "Star" },
  { from: "#fff" },
  "#fff",
  null,
  { from: "#ffff", to: "#000" },
];
const LOOKUPS = ["rose", "cake", "tw_monkey", "nope", "custom_admin", "custom_hidden", "ug_user", 5, null];

const SEED_SCRIPT = `
const server = ${JSON.stringify(path.join(REPO_ROOT, "server"))};
const db = require(server + "/db.js");
const g = require(server + "/data/gifts.js");
const { sanitizeGiftBackground } = require(server + "/lib/giftBackground.js");
const offSale = require(server + "/data/catalog/gifts.json").find((x) => !require(server + "/data/catalog/gifts-on-sale.json").includes(x.id));
g.setSupply("rose", 5000);
g.setGiftScene("cake", { layers: [{ type: "emoji", emoji: "🎂" }] });
g.hideBuiltin("tw_monkey");
g.hideBuiltin(offSale.id);
g.createGift({ id: "custom_admin", emoji: "🦀", name: "Краб", priceStars: 55, premiumDays: null, supply: 1000, exclusive: true, mediaUrl: "/uploads/x.gif" });
g.createGift({ id: "custom_hidden", emoji: "🐙", name: "Осьминог", priceStars: 7, premiumDays: 0, supply: null, exclusive: false });
g.hideBuiltin("custom_hidden");
db.prepare("UPDATE gift_catalog SET hidden = 1 WHERE id = 'custom_hidden'").run();
g.createUserGift({ id: "ug_user", ownerId: "u1", name: "Мой", scene: { layers: [] }, emoji: "🎨" });
db.prepare("INSERT INTO gift_catalog (id, custom, createdAt, scene) VALUES ('tw_duck_spy', 0, '2026-01-01', 'not json')").run();
const lookups = ${JSON.stringify(LOOKUPS)};
const out = {
  rows: db.prepare("SELECT * FROM gift_catalog").all(),
  onSale: g.listGifts(),
  all: g.listGifts({ includeHidden: true }),
  get: lookups.map((id) => g.getGift(id) ?? null),
  isOnSale: lookups.map((id) => g.isOnSale(id)),
  userGifts: g.listUserGifts("u1"),
  constants: [g.SUPPLY_MIN, g.SUPPLY_MAX, g.STARS_PER_RUB],
  conversion: [g.conversionValue({ priceRub: 3 }), g.conversionValue({ priceRub: 3, priceStars: 0 }), g.conversionValue({ priceRub: 1, priceStars: 12.6 })],
  backgrounds: ${JSON.stringify(BACKGROUNDS)}.map(sanitizeGiftBackground),
};
db.close();
require("fs").writeFileSync(process.env.SEED_OUT, JSON.stringify(out));
`;

let dir: string;
let legacy: Record<string, any>;
let catalog: GiftCatalogService;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-gifts-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "seed.json");
  execFileSync(process.execPath, ["-e", SEED_SCRIPT], {
    cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: "test", SEED_OUT: out },
    stdio: "ignore",
  });
  legacy = JSON.parse(fs.readFileSync(out, "utf8"));
  const rows: GiftCatalogRow[] = legacy.rows;
  const repo = {
    listCatalogRows: () => rows,
    findCatalogRow: (id: string) => rows.find((r) => r.id === id),
    listUserGiftRows: (ownerId: string) => rows.filter((r) => r.ownerId === ownerId && !r.hidden),
  } as unknown as GiftsRepository;
  catalog = new GiftCatalogService(repo);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Как в HTTP-ответе: undefined-поля пропадают.
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));

describe("каталог подарков совпадает с server/data/gifts.js", () => {
  it("витрина и весь каталог с правками админа", () => {
    expect(BUILTIN_GIFTS.some((g) => !ON_SALE_IDS.has(g.id))).toBe(true);
    expect(asJson(catalog.list())).toEqual(legacy.onSale);
    expect(asJson(catalog.list(true))).toEqual(legacy.all);
  });

  it("поиск подарка по id и продаётся ли он", () => {
    expect(LOOKUPS.map((id) => asJson(catalog.get(id)))).toEqual(legacy.get);
    expect(LOOKUPS.map((id) => catalog.isOnSale(id))).toEqual(legacy.isOnSale);
    expect(asJson(catalog.listUserGifts("u1"))).toEqual(legacy.userGifts);
  });

  it("константы и цена обмена на звёзды", () => {
    expect([SUPPLY_MIN, SUPPLY_MAX, STARS_PER_RUB]).toEqual(legacy.constants);
    expect([conversionValue({ priceRub: 3 }), conversionValue({ priceRub: 3, priceStars: 0 }), conversionValue({ priceRub: 1, priceStars: 12.6 })]).toEqual(
      legacy.conversion,
    );
  });

  it("фон подарка = server/lib/giftBackground.js", () => {
    expect(asJson(BACKGROUNDS.map(sanitizeGiftBackground))).toEqual(legacy.backgrounds);
  });
});
