const ATTACHMENT_LABEL = {
  image: "📷 Фото",
  video: "🎬 Видео",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: null,
  checklist: null,
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

const ceText = (t) => plainText((t ?? "").replace(/\[ce:\d+\]/g, "🎨"));

// Превью в списке чатов и плашках — без разметки: «**жирный**» → «жирный»,
// спойлер прячется за точками, блок кода и цитата — просто текстом.
export function plainText(t) {
  return t
    .replace(/```[a-z0-9+#-]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/\|\|([^|]+)\|\|/g, (_, s) => "⠿".repeat(Math.min(8, Math.max(3, s.length))))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*\s][^*]*)\*/g, (_, ...g) => g.slice(0, 5).find((x) => x != null))
    .replace(/^> ?/gm, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

const SLOT_SYMBOLS = ["BAR", "🍇", "🍋", "7️⃣"];

// Человеческий результат броска: для 🎰 — три символа, для мячей — попал или нет.
export function diceResult(meta) {
  const v = meta?.value ?? 0;
  switch (meta?.emoji) {
    case "🎰": {
      const n = v - 1;
      const reels = [n % 4, (n >> 2) % 4, (n >> 4) % 4].map((i) => SLOT_SYMBOLS[i]);
      return `${reels.join(" ")}${v === 64 ? " — джекпот!" : reels[0] === reels[1] && reels[1] === reels[2] ? " — три в ряд!" : ""}`;
    }
    case "🎯": return v === 6 ? "В яблочко!" : v === 1 ? "Мимо" : `Очки: ${v}`;
    case "🏀": return v >= 4 ? "Попадание!" : "Мимо";
    case "⚽": return v >= 3 ? "Гол!" : "Мимо";
    case "🎳": return v === 6 ? "Страйк!" : `Сбито кеглей: ${[0, 1, 3, 4, 5, 6][v - 1] ?? v}`;
    default: return `Выпало: ${v}`;
  }
}

export function messagePreview(m) {
  if (!m) return "";
  if (m.type === "system") return ceText(m.text);
  if (m.type === "sticker") return `${m.sticker?.emoji ?? ""} Стикер`.trim();
  if (m.type === "gift") return `🎁 ${m.gift?.name ?? "Подарок"}`;
  const att = m.attachments?.[0];
  const text = ceText(m.text);
  if (att) {
    if (att.kind === "poll") return `📊 ${text || "Опрос"}`;
    if (att.kind === "checklist") return `☑️ ${text || "Чек-лист"}`;
    if (att.kind === "dice") return `${att.meta?.emoji ?? "🎲"} ${diceResult(att.meta)}`;
    if (att.kind === "file" && att.name) {
      const isAudio = att.mimeType?.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(att.name);
      const label = isAudio ? `🎵 ${att.name.replace(/\.[a-z0-9]{1,5}$/i, "")}` : `📄 ${att.name}`;
      return text ? `${label} · ${text}` : label;
    }
    const label = ATTACHMENT_LABEL[att.kind];
    if (label) return text ? `${label} · ${text}` : label;
    return text || att.name || "Вложение";
  }
  return text;
}
