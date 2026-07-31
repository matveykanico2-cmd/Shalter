import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { api } from "../api.js";
import { getState } from "../state.js";

function railButton(href, iconName, label, active) {
  return el(
    "a",
    {
      href,
      "data-route": "1",
      title: label,
      class: `rail-btn ${active ? "active" : ""}`,
      html: iconSvg(iconName, 20),
    }
  );
}

export function NavRail() {
  const { user, accounts } = getState();
  const path = window.location.pathname;

  const nav = el("nav", { class: "nav-rail" });

  const accountBtn = el("button", { class: "nav-rail-account", title: "Аккаунты" }, [
    Avatar({ name: user.name || user.phone, color: user.avatarColor, image: user.avatarImage, size: 40, online: true }),
  ]);
  accountBtn.addEventListener("click", (e) => {
    const rect = accountBtn.getBoundingClientRect();
    showAccountSwitcher({ x: rect.right, y: rect.top });
  });

  nav.append(
    accountBtn,
    railButton("/", "Send", "Чаты", path === "/" || path.startsWith("/chat")),
    railButton("/contacts", "Users", "Контакты", path === "/contacts"),
    railButton("/calls", "Phone", "Звонки", path === "/calls"),
    railButton("/archive", "Archive", "Архив", path === "/archive"),
    el("div", { class: "nav-rail-spacer" }),
    railButton("/settings", "Settings", "Настройки", path.startsWith("/settings"))
  );

  function showAccountSwitcher(pos) {
    const items = [{ label: "Аккаунты" }];
    for (const a of accounts) {
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
      // A real navigation, not the SPA router's navigate() — /login has no
      // client-side route registered in app.js (it's only ever handled by
      // boot()'s special-case on a fresh page load), so navigate() here
      // just fell through to notFound() and bounced straight back to "/".
      onClick: () => (window.location.href = "/login?add=1"),
    });
    openDropdownMenu(pos, items);
  }

  return nav;
}
