import { useState } from "react";

import { Menu } from "@/shared/ui";

import type { BotCommand } from "../lib/slash-commands";

import styles from "./composer.module.css";

/** Кнопка «/» в чате с ботом — его команды списком (composer-command-btn). */
export function BotCommandsButton({ commands, onCommand }: { commands: readonly BotCommand[]; onCommand: (command: string) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={`${styles.attach} ${styles.commandButton}`}
        title="Команды бота"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.top - 8 });
        }}
      >
        /
      </button>
      {at ? (
        <Menu
          at={at}
          label="Команды бота"
          items={commands.map((c) => ({ label: c.description ? `/${c.command} — ${c.description}` : `/${c.command}`, onClick: () => onCommand(`/${c.command}`) }))}
          onClose={() => setAt(null)}
        />
      ) : null}
    </>
  );
}
