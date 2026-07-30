import { el } from "../lib/dom.js";

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ name, color, image, size = 44, online, className = "" }) {
  const wrap = el("div", {
    class: `avatar ${className}`,
    style: { width: `${size}px`, height: `${size}px` },
  });
  if (image) {
    wrap.appendChild(
      el("img", { src: image, alt: name, class: "avatar-img", style: { width: `${size}px`, height: `${size}px` } })
    );
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
  return wrap;
}
