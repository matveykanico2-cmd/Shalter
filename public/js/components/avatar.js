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

// Должен совпадать с длительностью premium-orbit-spin у .avatar-orbit-ring (components.css).
const ORBIT_PERIOD_MS = 14_000;

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

export function videoAvatarUrl(user) {
  const main = user?.avatarImages?.[0];
  return main?.kind === "video" ? main.url : null;
}

export function Avatar({ name, color, image, video = null, size = 44, online, className = "", isPremium = false, isDeveloper = false, orbit = false }) {
  const wrap = el("div", {
    class: `avatar ${className}`,
    style: { width: `${size}px`, height: `${size}px` },
  });
  const fallback = () =>
    el("div", { class: "avatar-fallback", style: { background: color, fontSize: `${size * 0.4}px` } }, initials(name) || "?");
  if (video) {
    const videoEl = el("video", {
      class: "avatar-img",
      src: video,
      poster: image,
      autoplay: true,
      loop: true,
      muted: true,
      playsInline: true,
      style: { width: `${size}px`, height: `${size}px` },
    });
    videoEl.addEventListener("error", () => {
      videoEl.replaceWith(image ? imageNode() : fallback());
    });
    wrap.appendChild(videoEl);
  } else if (image) {
    wrap.appendChild(imageNode());
  } else {
    wrap.appendChild(fallback());
  }

  function imageNode() {
    const img = el("img", { loading: "lazy", decoding: "async", src: image, alt: name ?? "", class: "avatar-img", style: { width: `${size}px`, height: `${size}px` } });
    img.addEventListener("error", () => img.replaceWith(fallback()));
    return img;
  }

  if (online) {
    wrap.appendChild(
      el("span", {
        class: "avatar-online",
        style: { width: `${size * 0.28}px`, height: `${size * 0.28}px` },
      })
    );
  }

  if (orbit && (isPremium || isDeveloper) && size >= 32) {
    const items = orbitItemsFor(isPremium, isDeveloper);
    const radius = size / 2 + Math.max(8, size * 0.16);
    const itemSize = Math.max(14, Math.round(size * 0.24));
    // Фаза вращения от общих часов: аватар пересоздаётся при каждой перерисовке
    // шапки/списка, и без этого кольцо каждый раз отпрыгивало в начальное положение.
    const phase = -(performance.now() % ORBIT_PERIOD_MS) / 1000;
    const orbitWrap = el("div", { class: "avatar-orbit-wrap", style: `width:${size}px;height:${size}px;--orbit-phase:${phase}s` }, [
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
