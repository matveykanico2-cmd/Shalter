import { SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

import styles from "./sections.module.css";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className={styles.kbdGroup}>
      {keys.map((k) => (
        <kbd key={k} className={styles.kbd}>
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** «Горячие клавиши» — renderShortcuts. */
export function ShortcutsSection() {
  const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
  const row = (label: string, keys: string[]) => <SettingsRow key={`${label}-${keys.join("+")}`} title={label} right={<Keys keys={keys} />} />;
  return (
    <SettingsPage>
      <SettingsSection title="Поиск">
        {row("Открыть поиск", [mod, "F"])}
        {row("Открыть поиск", [mod, "K"])}
        {row("Выбрать результат", ["↑", "↓"])}
        {row("Открыть выбранный", ["Enter"])}
        {row("Очистить поиск", ["Esc"])}
      </SettingsSection>
      <SettingsSection title="Навигация">
        {row("Следующий чат", ["Alt", "↓"])}
        {row("Предыдущий чат", ["Alt", "↑"])}
        {row("Избранное", [mod, "0"])}
        {row("Вкладка или папка по номеру", [mod, "1…9"])}
        {row("Закрыть чат / окно", ["Esc"])}
      </SettingsSection>
    </SettingsPage>
  );
}
