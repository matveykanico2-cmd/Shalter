import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
// Клиентский ES-модуль без типов: грузим по абсолютному file:// URL, как chatSort.
const load = () => import(pathToFileURL(path.join(import.meta.dirname, "../../../public/js/lib/slashCommands.js")).href);

test("слэш-команды превращаются в разметку", async () => {
  const { parseSlashCommand: p } = await load();
  assert.deepEqual(p("/spoiler секрет"), { text: "||секрет||", silent: false });
  assert.deepEqual(p("/спойлер два\nслова"), { text: "||два||\n||слова||", silent: false });
  assert.deepEqual(p("/quote а\nб"), { text: "> а\n> б", silent: false });
  assert.deepEqual(p("/silent тсс"), { text: "тсс", silent: true });
  assert.deepEqual(p("/dice"), { dice: "🎲" });
  assert.ok(p("/bold").error);
});

test("чужие и бот-команды уходят как есть", async () => {
  const { parseSlashCommand: p } = await load();
  assert.equal(p("/start"), null);
  assert.equal(p("просто /spoiler в середине"), null);
  assert.equal(p("/spoiler x", { reserved: ["spoiler"] }), null);
});

test("подсказки: команды бота первыми, без дублей", async () => {
  const { suggestSlashCommands: s } = await load();
  const list = s("", [{ command: "spoiler", description: "бот" }]);
  assert.equal(list[0].bot, true);
  assert.equal(list.filter((c: any) => c.name === "spoiler").length, 1);
  assert.deepEqual(s("спой").map((c: any) => c.name), ["spoiler"]);
});
