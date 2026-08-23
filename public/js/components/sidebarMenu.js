import { openDropdownMenu } from "./dropdownMenu.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";

// Меню приложения под гамбургером в шапке боковой панели — то самое, что в
// Telegram открывается кнопкой «☰» слева от поиска.
//
// Раньше эти же переходы жили на узком рельсе иконок вдоль левого края окна.
// Рельс остался только на телефоне (нижняя панель, до неё дотягивается большой
// палец); на широком экране он убран, и всё, что на нём было — аккаунты,
// контакты, звонки, архив, настройки, — собрано здесь. Тема и анимации тоже
// переехали сюда, потому что раньше их прятало меню аватарки на рельсе.
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
        await api.switchAccount(a.id);
        window.location.reload();
      },
    });
  }
  items.push({
    icon: "Plus",
    label: "Добавить аккаунт",
    // Настоящий переход, а не navigate(): маршрута /login в роутере нет, его
    // разбирает только boot() при загрузке страницы.
    onClick: () => (window.location.href = "/login?add=1"),
  });

  items.push({ separator: true });
  items.push({ icon: "Users", label: "Контакты", onClick: () => navigate("/contacts") });
  items.push({ icon: "Phone", label: "Звонки", onClick: () => navigate("/calls") });
  items.push({ icon: "Archive", label: "Архив", onClick: () => navigate("/archive") });
  items.push({ icon: "Globe", label: "Каталог каналов", onClick: () => navigate("/discover-channels") });
  items.push({ icon: "Settings", label: "Настройки", onClick: () => navigate("/settings") });

  items.push({ separator: true });
  const theme = settings?.theme ?? "system";
  const effectiveDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  items.push({
    icon: "Image",
    label: effectiveDark ? "Отключить тёмную тему" : "Включить тёмную тему",
    onClick: async () => {
      const next = effectiveDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      setState({ settings: { ...getState().settings, theme: next } });
      await api.patchSettings({ theme: next });
    },
  });
  const reduceMotion = !!settings?.reduceMotion;
  items.push({
    icon: "Zap",
    label: reduceMotion ? "Включить анимации" : "Отключить анимации",
    onClick: async () => {
      const next = !reduceMotion;
      document.documentElement.toggleAttribute("data-reduce-motion", next);
      setState({ settings: { ...getState().settings, reduceMotion: next } });
      await api.patchSettings({ reduceMotion: next });
    },
  });

  items.push({ separator: true });
  items.push({ icon: "Download", label: "Скачать приложение", onClick: () => (window.location.href = "/download") });
  // Служебный аккаунт «Shalter» — тот же, что рассылает коды входа: жалобу
  // читает живой человек, а не форма в никуда.
  items.push({ icon: "Bug", label: "Сообщить об ошибке", onClick: () => navigate("/u/shalter") });

  openDropdownMenu(pos, items);
}
