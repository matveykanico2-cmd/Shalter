// Стикер, крупные эмодзи и свои эмодзи — узлы движка анимаций (shared/lib/anim) в React.
import { renderAnimatedEmoji, renderCustomScene, renderSticker, type Sticker } from "@/shared/lib/anim";
import { DomNode, EmojiText } from "@/shared/ui";

import { graphemes } from "../lib/jumbo";
import { reactionSticker } from "../lib/reactions";
import { hasAnimatedEmoji } from "../lib/reactions-anim";

import styles from "./message-bubble.module.css";

// Стикер и анимированные эмодзи играют один раз — при первом показе сообщения.
const seen = new Set<string>();
function firstShow(key: string) {
  const fresh = !seen.has(key);
  seen.add(key);
  return fresh;
}

export function StickerBody({ messageId, sticker, onStickerClick }: { messageId: string; sticker: Sticker; onStickerClick?: (sticker: Sticker) => void }) {
  const fresh = firstShow(`sticker:${messageId}`);
  const image = sticker.kind === "image";
  return (
    <button
      type="button"
      className={["sticker-message", image ? "is-image" : "", fresh ? "" : "no-entrance", "no-frame"].filter(Boolean).join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        onStickerClick?.(sticker);
      }}
    >
      <DomNode create={() => renderSticker(sticker, { size: image ? 160 : 84, replay: fresh })} label={sticker.emoji || "Стикер"} />
    </button>
  );
}

/** 1–3 эмодзи: анимированные Noto, если есть у всех, иначе просто крупно. */
export function JumboEmoji({ messageId, text, count }: { messageId: string; text: string; count: number }) {
  const list = graphemes(text.trim());
  if (!list.every(hasAnimatedEmoji)) return (
      <span className={`${styles.jumbo} ${styles[`jumbo${count}`]}`}>
        <EmojiText text={text.trim()} />
      </span>
    );
  const size = count === 1 ? 128 : count === 2 ? 88 : 72;
  const play = firstShow(`jumbo:${messageId}`);
  return (
    <span className={styles.jumboAnimated} aria-label={text.trim()}>
      {list.map((g, i) => (
        <DomNode key={i} create={() => renderAnimatedEmoji(g, { size, replay: play })} />
      ))}
    </span>
  );
}

/** Свой эмодзи сценой; jumbo — крупно, когда в сообщении только они. */
export function CustomEmoji({ scene, jumbo = false }: { scene: unknown; jumbo?: boolean }) {
  return <DomNode className={jumbo ? "inline-custom-emoji jumbo" : "inline-custom-emoji"} create={() => renderCustomScene(scene, { size: jumbo ? 100 : 30, replay: jumbo })} />;
}

/** Реакция: стикер, анимированный эмодзи или символ; play — её только что поставили. */
export function ReactionGlyph({ emoji, play = false, size = 22 }: { emoji: string; play?: boolean; size?: number }) {
  const sticker = reactionSticker(emoji);
  if (sticker) return <DomNode create={() => renderSticker(sticker, { size })} label={sticker.name} />;
  if (!hasAnimatedEmoji(emoji)) return <EmojiText text={emoji} />;
  return <DomNode key={play ? "play" : "rest"} create={() => renderAnimatedEmoji(emoji, { size, replay: play, playOnView: true })} />;
}
