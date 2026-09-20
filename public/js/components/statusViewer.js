import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Tapping a status badge anywhere (chat list, profile, chat header…) opens
// the icon full-size — same idea as tapping an avatar (avatarViewer.js), just
// for the small badge next to the name instead of the photo above it.
export function openStatusViewer(subject) {
  const overlay = el("div", { class: "modal-overlay status-viewer-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", {
    class: "status-viewer-dialog",
    // Feeds the icon itself into the blurred glow behind it (see
    // .status-viewer-dialog::before) — a CSS custom property because the
    // image is per-status, not something a class selector can express.
    // A string, not an object: el()'s object-style path does
    // Object.assign(node.style, ...), which silently fails to set custom
    // properties (see giftCardDialog.js's --gift-from/--gift-to for the
    // same reason) — only the string path (node.style = "...", which
    // parses as cssText) actually applies them.
    // Quoted: statusIcon is usually a data: URL (data:image/png;base64,...)
    // — the semicolons inside it would otherwise terminate the inline
    // style's CSS declaration early. Quotes make the whole thing one CSS
    // string, semicolons and all.
    style: `--status-glow-image: url("${subject.statusIcon}")`,
  }, [
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
