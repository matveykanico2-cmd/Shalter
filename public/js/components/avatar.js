import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const DEV_ORBIT_ICON = { icon: "Code", color: "#1c9bd9" };
const PREMIUM_ORBIT_ICONS = [
  { icon: "Crown", color: "#d9822e" },
  { icon: "Star", color: "#f0b74a" },
  { icon: "Gift", color: "#2e56d9" },
  { icon: "Zap", color: "#6e56c6" },
  { icon: "Shield", color: "#1f9d63" },
  { icon: "Smile", color: "#c6403b" },
];

function orbitItemsFor(isPremium, isDeveloper) {
  if (isPremium && isDeveloper) {
    return Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? DEV_ORBIT_ICON : PREMIUM_ORBIT_ICONS[i]));
  }
  if (isDeveloper) return Array(4).fill(DEV_ORBIT_ICON);
  if (isPremium) return PREMIUM_ORBIT_ICONS;
  return [];
}

export function Avatar({ name, color, image, size = 44, online, className = "", isPremium = false, isDeveloper = false, orbit = false }) {
  const wrap = el("div", {
    class: `avatar ${className}`,
    style: { width: `${size}px`, height: `${size}px` },
  });
  if (image) {
    // Картинка может не загрузиться: у бота её задаёт владелец через Bot API
    // обычной ссылкой, и ссылка бывает мёртвой. Без запасного варианта на
    // экране оставался «сломанный файл» с текстом alt поперёк строки — видно
    // было на списке ботов. Теперь такой аватар молча становится буквами.
    const img = el("img", { src: image, alt: name, class: "avatar-img", style: { width: `${size}px`, height: `${size}px` } });
    img.addEventListener("error", () => {
      img.replaceWith(
        el("div", { class: "avatar-fallback", style: { background: color, fontSize: `${size * 0.4}px` } }, initials(name) || "?")
      );
    });
    wrap.appendChild(img);
  } else {
    wrap.appendChild(
      el(
        "div",
        {
          class: "avatar-fallback",
          style: { background: color, fontSize: `${size * 0.4}px` },
        },
        initials(name) || "?"
      )
    );
  }
  if (online) {
    wrap.appendChild(
      el("span", {
        class: "avatar-online",
        style: { width: `${size * 0.28}px`, height: `${size * 0.28}px` },
      })
    );
  }

  // The orbiting badge ring is an explicit opt-in (not just "isPremium/
  // isDeveloper is true"), because it needs open space around the avatar to
  // read as a ring rather than stray fragments — confirmed by trying it in a
  // densely packed chat-list row, where the ring's icons spilled past the
  // row's own height into the row above/below and looked like a rendering
  // glitch, not a badge. Only call sites with real breathing room around the
  // avatar (profile dialogs, chat header, nav rail, own settings profile)
  // should pass orbit: true; list rows keep the existing small inline
  // crown/code badge next to the name instead.
  if (orbit && (isPremium || isDeveloper) && size >= 32) {
    const items = orbitItemsFor(isPremium, isDeveloper);
    const radius = size / 2 + Math.max(8, size * 0.16);
    const itemSize = Math.max(14, Math.round(size * 0.24));
    const orbitWrap = el("div", { class: "avatar-orbit-wrap", style: `width:${size}px;height:${size}px` }, [
      wrap,
      el(
        "div",
        { class: "avatar-orbit-ring" },
        items.map((item, i) =>
          el("div", { class: "avatar-orbit-item", style: `--angle:${(360 / items.length) * i}deg; --radius:${radius}px; width:${itemSize}px; height:${itemSize}px; margin:${-itemSize / 2}px` }, [
            el("div", { class: "avatar-orbit-item-icon", style: `--orbit-color:${item.color}`, html: iconSvg(item.icon, Math.round(itemSize * 0.62)) }),
          ])
        )
      ),
    ]);
    return orbitWrap;
  }

  return wrap;
}
