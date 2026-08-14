// One-line description of a message, for the places that show a message
// somewhere other than as itself: the chat list's last-message row and the
// pinned-message bar.
//
// It exists because plenty of messages carry no `text` at all — a sticker, a
// gift, a photo, a voice note, a poll — and anything that printed `m.text`
// straight out rendered an empty line for them. The chat list had its own copy
// of this logic (and the comment explaining why); the pinned bar didn't, so
// pinning a sticker or a gift produced a bar with an icon and nothing beside it.

const ATTACHMENT_LABEL = {
  image: "📷 Фото",
  video: "🎬 Видео",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: null, // the question itself is the better label — see below
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

export function messagePreview(m) {
  if (!m) return "";
  if (m.type === "system") return m.text ?? "";
  if (m.type === "sticker") return `${m.sticker?.emoji ?? ""} Стикер`.trim();
  if (m.type === "gift") return `🎁 ${m.gift?.name ?? "Подарок"}`;
  const att = m.attachments?.[0];
  if (att) {
    if (att.kind === "poll") return `📊 ${m.text || "Опрос"}`;
    const label = ATTACHMENT_LABEL[att.kind];
    // An unknown attachment kind falls back to the caption, then to the file
    // name — better a filename than a blank row.
    if (label) return m.text ? `${label} · ${m.text}` : label;
    return m.text || att.name || "Вложение";
  }
  return m.text ?? "";
}
