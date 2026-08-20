import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";

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
    // Без orbit: спутники вылетают за аватар на 14 пикселей в каждую
    // сторону, а рельс узкий и прижат к краю окна — левый спутник просто
    // срезался краем экрана на всех страницах сразу. Украшение остаётся там,
    // где под него есть место: в профиле и в настройках.
    Avatar({ name: user.name || user.phone, color: user.avatarColor, image: user.avatarImage, size: 40, online: true, isPremium: user.isPremium, isDeveloper: user.isDeveloper }),
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
    // The "Shalter" service account (server/data/systemBot.js) already
    // delivers login codes/security alerts to every user — reusing it as the
    // bug-report inbox means an actual person (whoever holds ADMIN_PHONE)
    // reads it, not a form that goes nowhere. Routes through the same
    // /u/:username deep link a scanned profile QR code uses.
    items.push({ icon: "Bug", label: "Сообщить об ошибке", onClick: () => navigate("/u/shalter") });

    openDropdownMenu(pos, items);
  }

  return nav;
}
