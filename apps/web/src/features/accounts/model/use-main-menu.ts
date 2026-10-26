import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { chatQueries, openDm, openServiceChat } from "@/entities/chat";
import { type SelfUser, useSession } from "@/entities/session";
import { settingsQueries, useUpdateSettings } from "@/entities/settings";

import { errorText } from "@/shared/lib/error-text";
import { isInstalledApp } from "@/shared/lib/platform";
import { type MenuItem, toast } from "@/shared/ui";

import { switchAccount } from "./switch-account";

type Options = {
  me: SelfUser;
  onOpenProfile: () => void;
  /** Пункты разделов, у которых своё окно (игры, загрузки), — после «Звонков». */
  extra?: readonly MenuItem[];
};

const prefersDark = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

/**
 * Пункты главного меню — как openSidebarMenu (public/js/components/sidebarMenu.js):
 * аккаунты, «Мой профиль», Shalter AI, Избранное, разделы, «Настройки» и то, что было в «Ещё».
 */
export function useMainMenu({ me, onOpenProfile, extra = [] }: Options): MenuItem[] {
  const navigate = useNavigate();
  const client = useQueryClient();
  const accounts = useSession().data?.accounts ?? [];
  // Настройки кладёт в кэш /api/bootstrap — отдельного запроса меню не делает.
  const settings = useQuery({ ...settingsQueries.current(), enabled: false }).data;
  const update = useUpdateSettings();

  const openChat = (open: () => Promise<{ chatId: string }>, fallback: string) =>
    open().then(
      ({ chatId }) => void navigate(`/chat/${chatId}`),
      (err: unknown) => toast(errorText(err, fallback), { error: true })
    );

  const theme = settings?.theme ?? "system";
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  const reduceMotion = !!settings?.reduceMotion;

  return [
    { label: me.name || me.phone || "Аккаунт" },
    ...accounts
      .filter((a) => a.id !== me.id)
      .map((a): MenuItem => ({ icon: "Accounts", label: a.name || a.phone || a.email || "Аккаунт", onClick: () => void switchAccount(a.id) })),
    { icon: "Plus", label: "Добавить аккаунт", onClick: () => (window.location.href = "/login?add=1") },
    { icon: "User", label: "Мой профиль", onClick: onOpenProfile },
    { icon: "Zap", label: "Shalter AI", onClick: () => void openChat(() => openServiceChat("ai"), "Не удалось открыть Shalter AI") },
    { icon: "Bookmark", label: "Избранное", onClick: () => void openSavedMessages(me, client, navigate) },
    { icon: "Archive", label: "Архив", onClick: () => void navigate("/archive") },
    { icon: "Users", label: "Контакты", onClick: () => void navigate("/contacts") },
    { icon: "Phone", label: "Звонки", onClick: () => void navigate("/calls") },
    ...extra,
    { icon: "Settings", label: "Настройки", onClick: () => void navigate("/settings") },
    {
      icon: dark ? "Sun" : "Moon",
      label: dark ? "Отключить тёмную тему" : "Включить тёмную тему",
      onClick: () => update.mutate({ theme: dark ? "light" : "dark" }),
    },
    { icon: "Zap", label: reduceMotion ? "Включить анимации" : "Отключить анимации", onClick: () => update.mutate({ reduceMotion: !reduceMotion }) },
    { icon: "Globe", label: "Каталог каналов", onClick: () => void navigate("/discover-channels") },
    ...(isInstalledApp() ? [] : [{ icon: "Download", label: "Скачать приложение", onClick: () => (window.location.href = "/download") } satisfies MenuItem]),
    { icon: "Bug", label: "Сообщить об ошибке", onClick: () => void openChat(() => openServiceChat("bug"), "Не удалось открыть чат с поддержкой") },
  ];
}

/** «Избранное» — личка с самим собой: открыть, а если её ещё нет — создать (openSavedMessages). */
export async function openSavedMessages(me: SelfUser, client: ReturnType<typeof useQueryClient>, navigate: ReturnType<typeof useNavigate>) {
  const saved = client.getQueryData(chatQueries.list().queryKey)?.find((c) => c.isSaved);
  if (saved) return void navigate(`/chat/${saved.id}`);
  try {
    const { chat } = await openDm(me.id, "Избранное", me.avatarColor);
    void navigate(`/chat/${chat.id}`);
  } catch (err) {
    toast(errorText(err, "Не удалось открыть «Избранное»"), { error: true });
  }
}
