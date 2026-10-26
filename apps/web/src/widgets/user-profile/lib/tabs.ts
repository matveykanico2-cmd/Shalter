// Вкладки профиля в порядке TABS из public/js/components/profileDialog.js.
export type TabId = "media" | "stories" | "gifts" | "files" | "links" | "voice" | "groups";

export const TABS: { id: TabId; label: string }[] = [
  { id: "media", label: "Медиа" },
  { id: "stories", label: "Истории" },
  { id: "gifts", label: "Подарки" },
  { id: "files", label: "Файлы" },
  { id: "links", label: "Ссылки" },
  { id: "voice", label: "Голосовые и видео" },
  { id: "groups", label: "Группы" },
];
