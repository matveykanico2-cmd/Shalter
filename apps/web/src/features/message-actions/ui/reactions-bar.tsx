import { type RefObject, useEffect, useRef, useState } from "react";

import { type ChatSummary } from "@/entities/chat";
import { chosenReactions, type Message, PREMIUM_REACTIONS, QUICK_REACTIONS, REACTION_STICKER_PREFIX, REACTION_STICKERS, ReactionGlyph } from "@/entities/message";

import { ALL_EMOJI } from "@/shared/lib/emoji-list";
import { Icon } from "@/shared/ui";

import { allowedReactions } from "../lib/permissions";

import styles from "./message-actions.module.css";

type Props = {
  chat: ChatSummary;
  message: Message;
  meId: string;
  isPremium: boolean;
  onReact: (emoji: string) => void;
  /** Нажали реакцию Premium без Premium. */
  onLocked: () => void;
};

// Анимации в полосе оживают по одной после появления — десяток плееров разом дёргал её.
const UPGRADE_AFTER_MS = 220;
const UPGRADE_STEP_MS = 45;

/**
 * Плашка реакций — как openReactionsBar в public/js/components/reactionsMenu.js: быстрые
 * реакции, Premium (без него — с замком), ▾ раскрывает все эмодзи и стикеры. В чате
 * со списком разрешённых — только они, без раскрытия.
 */
export function ReactionsBar({ chat, message, meId, isPremium, onReact, onLocked }: Props) {
  const allowed = allowedReactions(chat);
  const [expanded, setExpanded] = useState(false);
  const chosen = chosenReactions(message, meId);
  const strip = allowed
    ? allowed.map((emoji) => ({ emoji, locked: false }))
    : [...QUICK_REACTIONS.map((emoji) => ({ emoji, locked: false })), ...PREMIUM_REACTIONS.map((emoji) => ({ emoji, locked: !isPremium }))];
  const pick = (emoji: string, locked: boolean) => (locked ? onLocked() : onReact(emoji));

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <div className={styles.strip} role="group" aria-label="Реакции">
          {strip.map(({ emoji, locked }, i) => (
            <ReactionButton key={emoji} emoji={emoji} chosen={chosen.has(emoji)} locked={locked} upgradeAfter={UPGRADE_AFTER_MS + i * UPGRADE_STEP_MS} onPick={() => pick(emoji, locked)} />
          ))}
        </div>
        {!allowed && !expanded ? (
          <button type="button" className={styles.more} title="Все реакции" aria-label="Все реакции" onClick={() => setExpanded(true)}>
            <Icon name="ChevronDown" size={18} />
          </button>
        ) : null}
      </div>
      {expanded ? <FullList chosen={chosen} onPick={onReact} /> : null}
    </div>
  );
}

function FullList({ chosen, onPick }: { chosen: ReadonlySet<string>; onPick: (emoji: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className={styles.grid}>
      <p className={styles.gridTitle}>Эмодзи</p>
      <div className={styles.gridItems}>
        {ALL_EMOJI.map((emoji) => (
          <button key={emoji} type="button" className={chosen.has(emoji) ? `${styles.reaction} ${styles.small} ${styles.chosen}` : `${styles.reaction} ${styles.small}`} aria-label={emoji} onClick={() => onPick(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
      <p className={styles.gridTitle}>Стикеры</p>
      <div className={styles.gridItems}>
        {REACTION_STICKERS.map((s) => {
          const value = REACTION_STICKER_PREFIX + s.id;
          return <ReactionButton key={value} emoji={value} title={s.name} chosen={chosen.has(value)} small rootRef={root} onPick={() => onPick(value)} />;
        })}
      </div>
    </div>
  );
}

type ButtonProps = {
  emoji: string;
  chosen: boolean;
  locked?: boolean;
  small?: boolean;
  title?: string;
  /** Через сколько мс показать живую анимацию (полоса). */
  upgradeAfter?: number;
  /** Живая — когда доскроллили (стикеры раскрытого списка). */
  rootRef?: RefObject<HTMLElement | null>;
  onPick: () => void;
};

function ReactionButton({ emoji, chosen, locked = false, small = false, title, upgradeAfter, rootRef, onPick }: ButtonProps) {
  const self = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (upgradeAfter !== undefined) {
      const t = setTimeout(() => setLive(true), upgradeAfter);
      return () => clearTimeout(t);
    }
    const el = self.current;
    if (!el || typeof IntersectionObserver === "undefined") return void setTimeout(() => setLive(true), 0);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        setLive(true);
      },
      { root: rootRef?.current, rootMargin: "80px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [upgradeAfter, rootRef]);

  const size = small ? 28 : 30;
  const sticker = emoji.startsWith(REACTION_STICKER_PREFIX);
  const className = [styles.reaction, small ? styles.small : "", chosen ? styles.chosen : "", locked ? styles.locked : ""].filter(Boolean).join(" ");
  return (
    <button ref={self} type="button" className={className} title={title ?? (locked ? "Реакция для Premium" : undefined)} aria-label={title ?? emoji} aria-pressed={chosen} onClick={onPick}>
      <span className={styles.glyph}>{live ? <ReactionGlyph emoji={emoji} size={size} /> : sticker ? <span className={styles.stub} style={{ width: size, height: size }} /> : emoji}</span>
      {locked ? (
        <span className={styles.lock}>
          <Icon name="Lock" size={9} />
        </span>
      ) : null}
    </button>
  );
}
