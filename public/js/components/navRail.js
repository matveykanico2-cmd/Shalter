import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { api } from "../api.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";

function railButton(href, iconName, label, isActive) {
  const node = el(
    "a",
    {
      href,
      "data-route": "1",
      title: label,
      class: "rail-btn",
      html: iconSvg(iconName, 20),
    }
  );
  node._isActive = isActive;
  return node;
}

export function NavRail() {
  const path = window.location.pathname;

  const nav = el("nav", { class: "nav-rail" });

  const accountBtn = el("button", { class: "nav-rail-account", title: "Аккаунты" });

  function paintAccount() {
    const { user } = getState();
    if (!user) return;
    accountBtn.textContent = "";
    accountBtn.appendChild(
      Avatar({ name: user.name || user.phone, color: user.avatarColor, image: user.avatarImage, size: 40, online: true, isPremium: user.isPremium, isDeveloper: user.isDeveloper })
    );
  }
  paintAccount();
  subscribe(paintAccount);
  accountBtn.addEventListener("click", (e) => {
    const rect = accountBtn.getBoundingClientRect();
    showAccountSwitcher({ x: rect.right, y: rect.top });
  });

  const railButtons = [
    railButton("/", "Send", "Чаты", (p) => p === "/" || p.startsWith("/chat")),
    railButton("/contacts", "Users", "Контакты", (p) => p === "/contacts"),
    railButton("/calls", "Phone", "Звонки", (p) => p === "/calls"),
    railButton("/archive", "Archive", "Архив", (p) => p === "/archive"),
  ];
  const settingsBtn = railButton("/settings", "Settings", "Настройки", (p) => p.startsWith("/settings"));
  railButtons.push(settingsBtn);

  nav.append(accountBtn, ...railButtons.slice(0, -1), el("div", { class: "nav-rail-spacer" }), settingsBtn);

  function paintActive(p) {
    for (const b of railButtons) b.classList.toggle("active", b._isActive(p));
  }
  paintActive(path);
  window.addEventListener("app:navigate", ({ detail }) => paintActive(detail.path));

  function showAccountSwitcher(pos) {
    const { user, accounts } = getState();
    const items = [
      {
        icon: "User",
        label: "Мой профиль",
        onClick: async () => {
          const { openProfileDialog } = await import("./profileDialog.js");
          openProfileDialog(user.id);
        },
      },
      { separator: true },
      { label: "Аккаунты" },
    ];
    for (const a of accounts ?? []) {
      items.push({
        label: `${a.name || a.phone || a.email}`,
        icon: undefined,
        onClick: async () => {
          if (a.id === user.id) return;
          await api.switchAccount(a.id);
          window.location.reload();
        },
      });
    }
    items.push({ separator: true });
    items.push({
      label: "Добавить аккаунт",
      icon: "Plus",
      onClick: () => (window.location.href = "/login?add=1"),
    });
    items.push({ separator: true });
    items.push({ icon: "Settings", label: "Настройки", onClick: () => navigate("/settings") });
    items.push({ separator: true });

    const settings = getState().settings;
    const theme = settings?.theme ?? "system";
    const effectiveDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    items.push({
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
      label: reduceMotion ? "Включить анимации" : "Отключить анимации",
      onClick: async () => {
        const next = !reduceMotion;
        document.documentElement.toggleAttribute("data-reduce-motion", next);
        setState({ settings: { ...getState().settings, reduceMotion: next } });
        await api.patchSettings({ reduceMotion: next });
      },
    });
    items.push({ separator: true });
    items.push({
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
    });

    openDropdownMenu(pos, items);
  }

  return nav;
}
