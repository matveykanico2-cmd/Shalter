import { describe, expect, it } from "vitest";

import { botCommandsOf, parseSlashCommand, suggestSlashCommands } from "./slash-commands";

describe("слэш-команды", () => {
  it("разметка, кубик, действие, ошибка без текста", () => {
    expect(parseSlashCommand("/spoiler тайна\nещё")).toEqual({ text: "||тайна||\n||ещё||", silent: false });
    expect(parseSlashCommand("/жирный важно")).toEqual({ text: "**важно**", silent: false });
    expect(parseSlashCommand("/code a\nb")).toEqual({ text: "```\na\nb\n```", silent: false });
    expect(parseSlashCommand("/тихо спят")).toEqual({ text: "спят", silent: true });
    expect(parseSlashCommand("/shrug")).toEqual({ text: "¯\\_(ツ)_/¯", silent: false });
    expect(parseSlashCommand("/казино")).toEqual({ dice: "🎰" });
    expect(parseSlashCommand("/game змейка")).toEqual({ action: "game", arg: "змейка" });
    expect(parseSlashCommand("/bold")).toEqual({ error: "Напишите текст после /bold" });
  });

  it("чужие команды и команды бота — как есть", () => {
    expect(parseSlashCommand("/start")).toBeNull();
    expect(parseSlashCommand("/dice", ["dice"])).toBeNull();
    expect(parseSlashCommand("просто /bold")).toBeNull();
  });

  it("подсказки: команды бота первыми, свои — по имени и синониму", () => {
    const bot = botCommandsOf([{ command: "/start", description: "Начать" }, { name: "spoiler" }, { foo: 1 }]);
    expect(bot).toEqual([
      { command: "start", description: "Начать" },
      { command: "spoiler", description: "" },
    ]);
    expect(suggestSlashCommands("s", bot).map((c) => c.name)).toEqual(["start", "spoiler", "strike", "silent", "shrug", "slot"]);
    expect(suggestSlashCommands("s", bot)[1]).toMatchObject({ bot: true, description: "Команда бота" });
    expect(suggestSlashCommands("кубик").map((c) => c.name)).toEqual(["dice"]);
  });
});
