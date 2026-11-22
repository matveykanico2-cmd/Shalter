// Вкладки профиля в порядке TABS из public/js/components/profileDialog.js.
export type TabId = "posts" | "media" | "gifts" | "files" | "links" | "voice" | "groups";

export const TABS: { id: TabId; label: string }[] = [
  { id: "posts", label: "Посты" },
  { id: "media", label: "Медиа" },
  { id: "gifts", label: "Подарки" },
  { id: "files", label: "Файлы" },
  { id: "links", label: "Ссылки" },
  { id: "voice", label: "Голосовые и видео" },
  { id: "groups", label: "Группы" },
];

export const isTabId = (value: unknown): value is TabId => TABS.some((tab) => tab.id === value);
