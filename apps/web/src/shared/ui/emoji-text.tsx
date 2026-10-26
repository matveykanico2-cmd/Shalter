import { useState } from "react";

import { emojiImageUrl, splitEmoji } from "../lib/emoji-images";

import styles from "./emoji-text.module.css";

/** Текст с эмодзи картинками (img.emoji в public/js/lib/emojiImages.js). */
export function EmojiText({ text }: { text: string }) {
  const parts = splitEmoji(text);
  if (!parts) return text;
  return parts.map((p, i) => (typeof p === "string" ? p : <EmojiImage key={i} emoji={p.emoji} />));
}

function EmojiImage({ emoji }: { emoji: string }) {
  // Нет картинки (не из набора tweb) — остаётся символом, без битой иконки.
  const [broken, setBroken] = useState(false);
  if (broken) return emoji;
  return <img className={`emoji ${styles.emoji}`} src={emojiImageUrl(emoji)} alt={emoji} draggable={false} decoding="async" loading="lazy" onError={() => setBroken(true)} />;
}
