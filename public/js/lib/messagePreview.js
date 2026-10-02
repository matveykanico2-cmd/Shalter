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
    const label = ATTACHMENT_LABEL[att.kind];
    if (label) return text ? `${label} · ${text}` : label;
    return text || att.name || "Вложение";
  }
  return text;
}
