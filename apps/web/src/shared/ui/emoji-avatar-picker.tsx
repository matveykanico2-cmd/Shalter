import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { http } from "../api";
import { hasAnimatedEmoji, renderSticker } from "../lib/anim";
import { DomNode } from "@/shared/ui";
import { ALL_EMOJI } from "../lib/emoji-list";
import { graphemes, isSingleEmoji } from "../lib/graphemes";
import styles from "./emoji-avatar-picker.module.css";
import { toast } from "./toast-store";

/** Все смайлы, у которых есть анимация, — как эмодзи-аватарки в Telegram. */
const EMOJIS = ALL_EMOJI.filter(hasAnimatedEmoji);

type Props = {
  onPick: (emoji: string) => void;
  label?: string;
  /** false — в своё поле можно ввести и букву или цифру (заставка группы/канала). */
  emojiOnly?: boolean;
  /** Показать и стикеры из своих паков: выбор приходит как «sticker:/uploads/…». */
  withStickers?: boolean;
};

type PackLite = { id: string; name: string; isAdded: boolean; stickers: { id: string; url: string; emoji: string }[] };

const myPacksQuery = {
  // Тот же ключ и ответ, что у панели стикеров: один запрос и один кэш на все экраны.
  queryKey: ["stickers", "packs"] as const,
  queryFn: async ({ signal }: { signal: AbortSignal }) => (await http.get<{ packs: PackLite[] }>("/api/stickers/packs", signal)).packs,
  staleTime: 60_000,
};

/** Выбор смайла на аватарку: сетка анимированных смайлов и поле для своего. */
export function EmojiAvatarPicker({ onPick, label = "Смайл на аватарке", emojiOnly = true, withStickers = false }: Props) {
  const [custom, setCustom] = useState("");
  const pick = (value: string) => {
    const text = value.trim();
    if (graphemes(text).length !== 1) return toast("Один смайл", { error: true });
    if (emojiOnly && !isSingleEmoji(text)) return toast("Некорректный эмодзи", { error: true });
    onPick(text);
  };
  return (
    <div className={styles.picker} role="group" aria-label={label}>
      <p className={styles.label}>{label}</p>
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
      {withStickers ? <StickerAvatarList onPick={onPick} /> : null}
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
