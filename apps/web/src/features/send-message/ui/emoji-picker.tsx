import { useRef, useState } from "react";

import { EMOJI_GROUPS } from "@/shared/lib/emoji-list";
import { Icon, Menu } from "@/shared/ui";

import styles from "./emoji-picker.module.css";

const RECENT_KEY = "shalter.recentEmoji";
const RECENT_MAX = 32;
const CATEGORY_ICONS = ["😀", "🐻", "🍔", "🚗", "⚽", "💡", "🏁"];
const PANEL_WIDTH = 368;

function readRecent(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(emoji: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...readRecent().filter((x) => x !== emoji)].slice(0, RECENT_MAX)));
  } catch {
    // Хранилище недоступно (приватное окно) — просто без «Недавних».
  }
}

/**
 * Эмодзи в поле ввода — как toggleEmoji/renderEmojiMenu в composer.js (панель tweb):
 * «Недавние» и семь категорий, внизу вкладки к разделам. Панель не закрывается после
 * выбора — можно набрать несколько подряд.
 */
export function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={styles.button}
        title="Эмодзи"
        aria-haspopup="menu"
        aria-expanded={!!at}
        // Открытую панель кнопка закрывает — нажатие не должно дойти до «закрыть снаружи».
        onPointerDown={(e) => {
          if (at) e.stopPropagation();
        }}
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right - PANEL_WIDTH, y: r.top - 8 });
        }}
      >
        <Icon name="Smile" size={20} />
      </button>
      {at ? (
        <Menu
          at={at}
          wide
          // Над полем ввода и без затемнения: видно, что вставилось, курсор остаётся в поле.
          sheet={false}
          autoFocus={false}
          label="Эмодзи"
          onClose={() => setAt(null)}
          header={
            <EmojiPanel
              onPick={(emoji) => {
                rememberRecent(emoji);
                onPick(emoji);
              }}
            />
          }
        />
      ) : null}
    </>
  );
}

function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  // «Недавние» — на момент открытия: выбранное не переставляет сетку под пальцем.
  const [sections] = useState(() => {
    const recent = readRecent();
    return [...(recent.length ? [{ name: "Недавние", emojis: recent, icon: null }] : []), ...EMOJI_GROUPS.map((g, i) => ({ ...g, icon: CATEGORY_ICONS[i] ?? null }))];
  });
  const scroller = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop + 8;
    let idx = 0;
    sectionRefs.current.forEach((s, i) => {
      if (s && s.offsetTop - el.offsetTop <= top) idx = i;
    });
    setActive(idx);
  };

  return (
    <div className={styles.panel}>
      <div ref={scroller} className={styles.scroll} onScroll={onScroll}>
        {sections.map((g, i) => (
          <section
            key={g.name}
            ref={(node) => {
              sectionRefs.current[i] = node;
            }}
            aria-label={g.name}
          >
            <p className={styles.title}>{g.name}</p>
            <div className={styles.grid}>
              {g.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={styles.emoji}
                  aria-label={emoji}
                  // Нажатие не уводит фокус из поля ввода: курсор и клавиатура остаются на месте.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className={styles.tabs}>
        {sections.map((g, i) => (
          <button
            key={g.name}
            type="button"
            className={i === active ? `${styles.tab} ${styles.active}` : styles.tab}
            title={g.name}
            aria-label={g.name}
            onClick={() => {
              const el = scroller.current;
              const target = sectionRefs.current[i];
              if (el && target) el.scrollTo({ top: target.offsetTop - el.offsetTop, behavior: "smooth" });
            }}
          >
            {g.icon ?? <Icon name="Clock" size={20} />}
          </button>
        ))}
      </div>
    </div>
  );
}
