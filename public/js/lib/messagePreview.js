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

const ceText = (t) => (t ?? "").replace(/\[ce:\d+\]/g, "🎨");

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
    const label = ATTACHMENT_LABEL[att.kind];
    if (label) return text ? `${label} · ${text}` : label;
    return text || att.name || "Вложение";
  }
  return text;
}
