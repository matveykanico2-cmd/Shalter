import { useState } from "react";

import { hasAnimatedEmoji } from "../lib/anim";
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
};

/** Выбор смайла на аватарку: сетка анимированных смайлов и поле для своего. */
export function EmojiAvatarPicker({ onPick, label = "Смайл на аватарке", emojiOnly = true }: Props) {
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
    </div>
  );
}
