import { useState } from "react";

import { useLongPress } from "@/shared/lib/use-long-press";
import { Icon, Menu, type MenuItem } from "@/shared/ui";

import type { SendOptions } from "../api/send-message";

import styles from "./composer.module.css";

const EFFECTS: [string, string][] = [
  ["🔥", "Огонь"],
  ["👍", "Класс"],
  ["👎", "Не нравится"],
  ["❤️", "Сердечки"],
  ["🎉", "Праздник"],
  ["💩", "Какашка"],
];

type Props = {
  editing: boolean;
  disabled: boolean;
  allowEffects: boolean;
  onSend: (options?: SendOptions) => void;
  onSchedule: () => void;
};

/**
 * «Отправить» — как в Telegram (composer.js): правая кнопка или долгое нажатие — «без звука»,
 * «позже» и, в личке, «с эффектом».
 */
export function SendButton({ editing, disabled, allowEffects, onSend, onSchedule }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; effects: boolean } | null>(null);
  const openAt = (x: number, y: number) => !editing && !disabled && setMenu({ x: x - 220, y: y - 8, effects: false });
  const hold = useLongPress((at) => openAt(at.x, at.y));
  const openEffects = (at: { x: number; y: number }) => setTimeout(() => setMenu({ x: at.x, y: at.y, effects: true }), 0);

  const items: MenuItem[] = menu?.effects
    ? EFFECTS.map(([emoji, name]) => ({ label: `${emoji}  ${name}`, onClick: () => onSend({ effect: emoji }) }))
    : [
        { icon: "BellOff", label: "Отправить без звука", onClick: () => onSend({ silent: true }) },
        { icon: "Clock", label: "Отправить позже", onClick: onSchedule },
        // Меню закрывается раньше, чем откроется следующее, — второе ставим в ту же точку.
        ...(allowEffects && menu ? [{ icon: "Zap" as const, label: "Отправить с эффектом", onClick: () => openEffects(menu) }] : []),
      ];

  return (
    <>
      <button
        type="button"
        className={styles.send}
        title={editing ? "Сохранить" : "Отправить (правый клик — другие варианты)"}
        aria-label={editing ? "Сохранить" : "Отправить"}
        disabled={disabled}
        onClick={(e) => {
          if (!hold.swallow(e)) onSend();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (hold.swallow(e)) return;
          const r = e.currentTarget.getBoundingClientRect();
          openAt(r.right, r.top);
        }}
        onPointerDown={hold.onPointerDown}
        onPointerMove={hold.onPointerMove}
        onPointerUp={hold.onPointerUp}
        onPointerCancel={hold.onPointerCancel}
        onPointerLeave={hold.onPointerLeave}
      >
        <Icon name={editing ? "Check" : "Send"} size={22} />
      </button>
      {menu ? <Menu at={menu} label={menu.effects ? "Эффект" : "Отправка"} items={items} onClose={() => setMenu(null)} /> : null}
    </>
  );
}
