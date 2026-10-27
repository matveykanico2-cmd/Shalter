// Слэш-команды в поле ввода — порт public/js/lib/slashCommands.js: «/spoiler текст» уходит
// замазанным, «/bold» — жирным, «/dice» бросает кубик. Команда становится обычной
// разметкой сообщения, на сервере ничего особого не нужно.

// Оборачивает каждую строку отдельно: inline-разметка не переносится через перевод строки.
const wrapLines = (mark: string) => (arg: string) =>
  arg
    .split("\n")
    .map((line) => (line.trim() ? `${mark}${line.trim()}${mark}` : line))
    .join("\n");

const append = (suffix: string) => (arg: string) => (arg ? `${arg} ${suffix}` : suffix);

type Command = {
  name: string;
  aliases: string[];
  description: string;
  /** true — без текста команда бессмысленна; "optional" — можно и без него. */
  arg?: true | "optional";
  hint?: string;
  text?: (arg: string) => string;
  silent?: boolean;
  dice?: string;
  action?: "game" | "poll" | "checklist";
};

export const SLASH_COMMANDS: Command[] = [
  { name: "spoiler", aliases: ["спойлер", "скрыть", "s"], arg: true, hint: "текст", description: "Замазать текст — откроется по нажатию", text: wrapLines("||") },
  { name: "bold", aliases: ["жирный", "b"], arg: true, hint: "текст", description: "Жирный текст", text: wrapLines("**") },
  { name: "italic", aliases: ["курсив", "i"], arg: true, hint: "текст", description: "Курсив", text: wrapLines("*") },
  { name: "underline", aliases: ["подчеркнуть", "u"], arg: true, hint: "текст", description: "Подчёркнутый текст", text: wrapLines("__") },
  { name: "strike", aliases: ["зачеркнуть", "del"], arg: true, hint: "текст", description: "Зачёркнутый текст", text: wrapLines("~~") },
  {
    name: "code",
    aliases: ["код"],
    arg: true,
    hint: "код",
    description: "Моноширинный текст или блок кода",
    text: (arg) => (arg.includes("\n") ? `\`\`\`\n${arg}\n\`\`\`` : `\`${arg}\``),
  },
  {
    name: "quote",
    aliases: ["цитата", "q"],
    arg: true,
    hint: "текст",
    description: "Оформить как цитату",
    text: (arg) =>
      arg
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n"),
  },
  { name: "silent", aliases: ["тихо"], arg: true, hint: "текст", description: "Отправить без звука уведомления", text: (arg) => arg, silent: true },
  { name: "caps", aliases: ["капс"], arg: true, hint: "текст", description: "ВСЕ БУКВЫ ЗАГЛАВНЫЕ", text: (arg) => arg.toUpperCase() },
  { name: "shrug", aliases: ["пофиг"], arg: "optional", hint: "текст", description: "¯\\_(ツ)_/¯", text: append("¯\\_(ツ)_/¯") },
  { name: "tableflip", aliases: ["стол"], arg: "optional", hint: "текст", description: "(╯°□°)╯︵ ┻━┻", text: append("(╯°□°)╯︵ ┻━┻") },
  { name: "unflip", aliases: [], arg: "optional", hint: "текст", description: "┬─┬ ノ( ゜-゜ノ)", text: append("┬─┬ ノ( ゜-゜ノ)") },
  { name: "lenny", aliases: [], arg: "optional", hint: "текст", description: "( ͡° ͜ʖ ͡°)", text: append("( ͡° ͜ʖ ͡°)") },
  { name: "dice", aliases: ["кубик"], description: "Бросить кубик 🎲", dice: "🎲" },
  { name: "darts", aliases: ["дартс"], description: "Метнуть дротик 🎯", dice: "🎯" },
  { name: "basketball", aliases: ["баскетбол"], description: "Бросить мяч в кольцо 🏀", dice: "🏀" },
  { name: "football", aliases: ["футбол"], description: "Ударить по воротам ⚽", dice: "⚽" },
  { name: "bowling", aliases: ["боулинг"], description: "Сбить кегли 🎳", dice: "🎳" },
  { name: "slot", aliases: ["казино"], description: "Крутить слот-машину 🎰", dice: "🎰" },
  { name: "game", aliases: ["игра", "игры", "games"], arg: "optional", hint: "название", description: "Отправить игру: /game змейка (без названия — каталог)", action: "game" },
  { name: "poll", aliases: ["опрос"], description: "Создать опрос", action: "poll" },
  { name: "todo", aliases: ["чеклист"], description: "Создать чек-лист", action: "checklist" },
];

const lookup = (name: string) => SLASH_COMMANDS.find((c) => c.name === name || c.aliases.includes(name)) ?? null;

export type SlashResult = { text: string; silent: boolean } | { dice: string } | { action: "game" | "poll" | "checklist"; arg: string } | { error: string };

/**
 * «/команда текст». null — не наша команда (например, команда боту), текст уходит как есть.
 * reserved — команды бота: в чате с ботом «/start» уходит боту.
 */
export function parseSlashCommand(input: string, reserved: readonly string[] = []): SlashResult | null {
  const m = /^\/([\p{L}\d_]+)(?:@\w+)?(?:[ \t]+|\n|$)([\s\S]*)$/u.exec(input);
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  if (reserved.includes(name)) return null;
  const cmd = lookup(name);
  if (!cmd) return null;
  const arg = m[2]!.trim();
  if (cmd.dice) return { dice: cmd.dice };
  if (cmd.action) return { action: cmd.action, arg };
  if (cmd.arg === true && !arg) return { error: `Напишите текст после /${cmd.name}` };
  return { text: cmd.text!(arg), silent: !!cmd.silent };
}

export type BotCommand = { command: string; description: string };

/** Команды бота из карточки чата: { command } или { name }, со слэшем или без. */
export function botCommandsOf(raw: unknown): BotCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: { command?: unknown; name?: unknown; description?: unknown }) => ({
      command: String(c?.command ?? c?.name ?? "").replace(/^\//, ""),
      description: typeof c?.description === "string" ? c.description : "",
    }))
    .filter((c) => c.command);
}

export type CommandSuggestion = { name: string; description: string; hint?: string; takesArg: boolean; bot: boolean };

/** Подсказки над полем по набранному «/нач»: сначала команды бота, потом свои. */
export function suggestSlashCommands(query: string, botCommands: readonly BotCommand[] = []): CommandSuggestion[] {
  const q = query.toLowerCase();
  const bot = botCommands.filter((c) => c.command.toLowerCase().startsWith(q)).map((c) => ({ name: c.command, description: c.description || "Команда бота", takesArg: false, bot: true }));
  const taken = new Set(bot.map((c) => c.name.toLowerCase()));
  const local = SLASH_COMMANDS.filter((c) => !taken.has(c.name) && (c.name.startsWith(q) || c.aliases.some((a) => a.startsWith(q)))).map((c) => ({
    name: c.name,
    description: c.description,
    hint: c.hint,
    takesArg: !!c.arg,
    bot: false,
  }));
  return [...bot, ...local].slice(0, 30);
}
