import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { http } from "../api";
import { renderSticker } from "../lib/anim";
import { DomNode } from "@/shared/ui";
import { ALL_EMOJI } from "../lib/emoji-list";
import { graphemes, isSingleEmoji } from "../lib/graphemes";
import styles from "./emoji-avatar-picker.module.css";
import { toast } from "./toast-store";

/** Все смайлы для аватарки: анимированные и статические. */
const EMOJIS = ALL_EMOJI;

/** Фоны для эмодзи-аватарки: первый — «Без фона» (прозрачный). */
const BACKGROUNDS: (string | null)[] = [
  null,
  "#e53935",
  "#fb8c00",
  "#fdd835",
  "#43a047",
  "#1e88e5",
  "#5e35b1",
  "#8e24aa",
  "linear-gradient(135deg, #ff9a9e, #fad0c4)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #fad0c4, #ffd1ff)",
];

type Props = {
  onPick: (emoji: string, color?: string | null) => void;
  label?: string;
  /** false — в своё поле можно ввести и букву или цифру (заставка группы/канала). */
  emojiOnly?: boolean;
  /** Показать и стикеры из своих паков: выбор приходит как «sticker:/uploads/…». */
  withStickers?: boolean;
  /** Текущий выбранный фон. */
  color?: string | null;
  /** Вызывается при выборе фона (без выбора смайла). */
  onColor?: (color: string | null) => void;
};

type PackLite = { id: string; name: string; isAdded: boolean; stickers: { id: string; url: string; emoji: string }[] };

const myPacksQuery = {
  queryKey: ["stickers", "packs"] as const,
  queryFn: async ({ signal }: { signal: AbortSignal }) => (await http.get<{ packs: PackLite[] }>("/api/stickers/packs", signal)).packs,
  staleTime: 60_000,
};

/** Выбор смайла на аватарку: сетка анимированных смайлов и поле для своего. */
export function EmojiAvatarPicker({ onPick, label = "Смайл на аватарке", emojiOnly = true, withStickers = false, color, onColor }: Props) {
  const [custom, setCustom] = useState("");
  const [background, setBackground] = useState<string | null>(color ?? null);
  const pick = (value: string) => {
    const text = value.trim();
    if (graphemes(text).length !== 1) return toast("Один смайл", { error: true });
    if (emojiOnly && !isSingleEmoji(text)) return toast("Некорректный эмодзи", { error: true });
    onPick(text, background);
  };
  const pickBackground = (value: string | null) => {
    setBackground(value);
    onColor?.(value);
  };
  return (
    <div className={styles.picker} role="group" aria-label={label}>
      <p className={styles.label}>{label}</p>
      <div className={styles.row} role="radiogroup" aria-label="Фон аватарки">
        {BACKGROUNDS.map((bg, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={background === bg}
            aria-label={bg === null ? "Без фона" : `Фон ${i}`}
            title={bg === null ? "Без фона" : undefined}
            className={styles.bgSwatch}
            style={{ background: bg ?? "transparent" }}
            onClick={() => pickBackground(bg)}
          />
        ))}
      </div>
      <div className={styles.row}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={styles.emoji} title={e} aria-label={e} onClick={() => pick(e)}>
            {e}
          </button>
        ))}
      </div>
      <div className={styles.inputWrap}>
        <input className={styles.input} maxLength={10} placeholder="свой смайл" aria-label="Свой смайл" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button type="button" className={styles.apply} onClick={() => pick(custom)}>
          Установить
        </button>
      </div>
      {withStickers ? <StickerAvatarList onPick={(v) => onPick(v, background)} /> : null}
    </div>
  );
}

/** Стикеры из своих паков (добавленных и созданных) — на аватарку вместо смайла. */
function StickerAvatarList({ onPick }: { onPick: (value: string) => void }) {
  const packs = useQuery(myPacksQuery).data?.filter((p) => p.isAdded && p.stickers.length) ?? [];
  if (!packs.length) return null;
  return (
    <>
      <p className={styles.label}>Стикер на аватарке</p>
      <div className={styles.row}>
        {packs.flatMap((p) =>
          p.stickers.map((s) => (
            <button key={`${p.id}:${s.id}`} type="button" className={styles.emoji} title={s.emoji} aria-label={`Стикер ${s.emoji}`} onClick={() => onPick(`sticker:${s.url}`)}>
              <DomNode className={styles.stickerNode} create={() => renderSticker({ url: s.url, emoji: s.emoji, kind: "image" as const }, { size: 28 })} />
            </button>
          ))
        )}
      </div>
    </>
  );
}
