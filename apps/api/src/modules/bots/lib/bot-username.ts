import { checkUsername } from "../../../legacy/legacy.js";

// Свободный ник бота из его имени — как generateBotUsername в server/lib/username.js.

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y",
  ь: "", э: "e", ю: "yu", я: "ya",
};

function translit(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("");
}

/** Транслит имени с окончанием _bot; занят — с номером. null — свободного не нашлось. */
export async function generateBotUsername(name: string): Promise<string | null> {
  let base = translit(name)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!base) base = "bot";
  base = base.slice(0, 24);

  let candidate = base.endsWith("_bot") ? base : `${base}_bot`;
  if (candidate.length < 3) candidate = `${candidate}_bot`;

  if (!(await checkUsername(candidate))) return candidate;
  for (let i = 2; i < 1000; i++) {
    const next = `${candidate}${i}`.slice(0, 32);
    if (!(await checkUsername(next))) return next;
  }
  return null;
}
