// Слэш-команды в поле ввода: «/spoiler текст» уходит замазанным, «/bold» —
// жирным, «/dice» бросает кубик и т. д. Команда превращается в обычную
// разметку сообщения (см. formatText.js), так что на сервере ничего особого
// не нужно, а у собеседника всё рисуется как любой отформатированный текст.

// Оборачивает каждую строку отдельно: inline-разметка не переносится через
// перевод строки, а так многострочный текст форматируется целиком.
const wrapLines = (mark) => (arg) =>
  arg
    .split("\n")
    .map((line) => (line.trim() ? `${mark}${line.trim()}${mark}` : line))
    .join("\n");

const append = (suffix) => (arg) => (arg ? `${arg} ${suffix}` : suffix);

// arg: true — без текста команда бессмысленна; "optional" — можно и без него.
export const SLASH_COMMANDS = [
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
    text: (arg) => arg.split("\n").map((l) => `> ${l}`).join("\n"),
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
  { name: "poll", aliases: ["опрос"], description: "Создать опрос", action: "poll" },
  { name: "todo", aliases: ["чеклист"], description: "Создать чек-лист", action: "checklist" },
];

function lookup(name) {
  const n = name.toLowerCase();
  return SLASH_COMMANDS.find((c) => c.name === n || c.aliases.includes(n)) ?? null;
}

// Разбирает «/команда текст». Возвращает null, если это не наша команда —
// тогда текст уходит как есть (например, команда боту).
// Иначе: { text, silent } — отправить текст; { dice } — бросить кубик;
// { action } — открыть диалог; { error } — показать подсказку.
export function parseSlashCommand(input, { reserved = [] } = {}) {
  const m = /^\/([\p{L}\d_]+)(?:@\w+)?(?:[ \t]+|\n|$)([\s\S]*)$/u.exec(input);
  if (!m) return null;
  const name = m[1].toLowerCase();
  // Команды бота важнее наших: в чате с ботом «/start» уходит боту.
  if (reserved.includes(name)) return null;
  const cmd = lookup(name);
  if (!cmd) return null;
  const arg = m[2].trim();
  if (cmd.dice) return { dice: cmd.dice };
  if (cmd.action) return { action: cmd.action, arg };
  if (cmd.arg === true && !arg) return { error: `Напишите текст после /${cmd.name}` };
  return { text: cmd.text(arg), silent: !!cmd.silent };
}

// Подсказки для меню над полем ввода по набранному «/нач».
export function suggestSlashCommands(query, botCommands = []) {
  const q = query.toLowerCase();
  const bot = botCommands
    .map((c) => ({ name: String(c.command ?? c.name ?? "").replace(/^\//, ""), description: c.description ?? "", bot: true }))
    .filter((c) => c.name && c.name.toLowerCase().startsWith(q));
  const taken = new Set(bot.map((c) => c.name.toLowerCase()));
  const local = SLASH_COMMANDS.filter(
    (c) => !taken.has(c.name) && (c.name.startsWith(q) || c.aliases.some((a) => a.startsWith(q)))
  ).map((c) => ({ name: c.name, hint: c.hint, description: c.description, takesArg: !!c.arg }));
  return [...bot, ...local].slice(0, 30);
}
