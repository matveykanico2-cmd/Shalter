import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Tapping a status badge anywhere (chat list, profile, chat header…) opens
// the icon full-size — same idea as tapping an avatar (avatarViewer.js), just
// for the small badge next to the name instead of the photo above it.
export function openStatusViewer(subject) {
  const overlay = el("div", { class: "modal-overlay status-viewer-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "status-viewer-dialog" }, [
    el("button", { class: "icon-btn status-viewer-close", title: "Закрыть", html: iconSvg("X", 20), onclick: () => close() }),
    el("img", { class: "status-viewer-image", src: subject.statusIcon, alt: "" }),
    subject.statusName ? el("p", { class: "status-viewer-caption" }, subject.statusName) : null,
    subject.name ? el("p", { class: "status-viewer-name" }, subject.name) : null,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  return close;
}
