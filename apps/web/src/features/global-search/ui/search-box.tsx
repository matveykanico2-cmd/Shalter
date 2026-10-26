import type { KeyboardEvent } from "react";

import { Icon } from "@/shared/ui";

import styles from "./search.module.css";

type Props = { value: string; onChange: (value: string) => void; onClear: () => void; results: () => HTMLElement | null };

/** «Поиск: чаты, люди, боты, каналы» над вкладками; стрелки ходят по найденному, Enter открывает. */
export function SearchBox({ value, onChange, onClear, results }: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (!value) return e.currentTarget.blur();
      e.preventDefault();
      e.stopPropagation();
      onClear();
      return;
    }
    const rows = [...(results()?.querySelectorAll<HTMLElement>("[data-search-row], a[href^='/chat/']") ?? [])];
    if (!rows.length) return;
    const current = rows.findIndex((r) => r.hasAttribute("data-kb-selected"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1);
      rows.forEach((r, i) => r.toggleAttribute("data-kb-selected", i === next));
      rows[next]!.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      (rows[current] ?? rows[0])!.click();
    }
  };
  return (
    <div className={styles.searchBox}>
      <span className={styles.searchIcon}>
        <Icon name="Search" size={16} />
      </span>
      <input className={styles.searchInput} type="search" placeholder="Поиск: чаты, люди, боты, каналы" aria-label="Поиск" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
    </div>
  );
}
