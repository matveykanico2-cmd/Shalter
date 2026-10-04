import { openDropdownMenu } from "./dropdownMenu.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";
import { switchAccount } from "../lib/accountSwitch.js";

// Меню ☰ как в tweb (sidebarLeft.createToolsMenu): аккаунты, затем Избранное, Архив,
// Контакты, Звонки, Настройки и «Ещё ▸» с темой, анимациями и прочим.
export function openSidebarMenu(pos) {
  const { user, accounts, settings } = getState();
  const items = [];

  items.push({ label: user.name || user.phone || "Аккаунт" });
  for (const a of accounts ?? []) {
    if (a.id === user.id) continue;
    items.push({
      icon: "Accounts",
      label: a.name || a.phone || a.email,
      onClick: async () => {
        await switchAccount(a.id);
      },
    });
  }
  items.push({
    icon: "Plus",
    label: "Добавить аккаунт",
    onClick: () => (window.location.href = "/login?add=1"),
  });

  items.push({ separator: true });
  items.push({
    icon: "User",
    label: "Мой профиль",
    onClick: async () => {
      const { openProfileDialog } = await import("./profileDialog.js");
      openProfileDialog(user.id);
    },
  });
  items.push({ icon: "Bookmark", label: "Избранное", onClick: () => openSavedMessages() });
  items.push({ icon: "Archive", label: "Архив", onClick: () => navigate("/archive") });
  items.push({ icon: "Users", label: "Контакты", onClick: () => navigate("/contacts") });
  items.push({ icon: "Phone", label: "Звонки", onClick: () => navigate("/calls") });

  items.push({ separator: true });
  items.push({ icon: "Settings", label: "Настройки", onClick: () => navigate("/settings") });
  items.push({ icon: "More", label: "Ещё", submenu: () => moreItems(settings) });

  openDropdownMenu(pos, items);
}

function moreItems(settings) {
  const theme = settings?.theme ?? "system";
  const effectiveDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const reduceMotion = !!settings?.reduceMotion;
  return [
    {
      icon: effectiveDark ? "Sun" : "Moon",
      label: effectiveDark ? "Отключить тёмную тему" : "Включить тёмную тему",
      onClick: async () => {
        const next = effectiveDark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        setState({ settings: { ...getState().settings, theme: next } });
        await api.patchSettings({ theme: next });
      },
    },
    {
      icon: "Zap",
      label: reduceMotion ? "Включить анимации" : "Отключить анимации",
      onClick: async () => {
        const next = !reduceMotion;
        document.documentElement.toggleAttribute("data-reduce-motion", next);
        setState({ settings: { ...getState().settings, reduceMotion: next } });
        await api.patchSettings({ reduceMotion: next });
      },
    },
    { separator: true },
    { icon: "Globe", label: "Каталог каналов", onClick: () => navigate("/discover-channels") },
    { icon: "Download", label: "Скачать приложение", onClick: () => (window.location.href = "/download") },
    {
      icon: "Bug",
      label: "Сообщить об ошибке",
      onClick: async () => {
        try {
          const { chatId } = await api.openBugReportChat();
          navigate(`/chat/${chatId}`);
        } catch (err) {
          alert(err.message || "Не удалось открыть чат с поддержкой");
        }
      },
    },
  ];
}

export async function openSavedMessages() {
  const { user, chats } = getState();
  const existing = (chats ?? []).find((c) => c.isSaved);
  if (existing) return navigate(`/chat/${existing.id}`);
  try {
    const { chat } = await api.startDm(user.id, "Избранное", user.avatarColor);
    navigate(`/chat/${chat.id}`);
    api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
  } catch (err) {
    alert(err.message || "Не удалось открыть «Избранное»");
  }
}
