import { el } from "../lib/dom.js";
import qrcode from "../lib/qrcode.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 12, scalable: true });
}

export function openProfileQrDialog(user) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const url = `${window.location.origin}/u/${user.username}`;
  const copiedNote = el("p", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog qr-profile-dialog" }, [
    el("div", { class: "qr-profile-header" }, [
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
      el("h2", { class: "modal-title" }, "QR-код"),
      el("span", { class: "qr-profile-header-spacer" }),
    ]),
    el("div", { class: "qr-profile-card" }, [
      Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 56, className: "qr-profile-avatar" }),
      el("div", { class: "qr-login-code", html: qrSvg(url) }),
      el("p", { class: "mono qr-profile-username" }, `@${user.username}`),
    ]),
    el(
      "button",
      {
        class: "btn-accent",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            copiedNote.textContent = "Ссылка скопирована ✓";
          } catch {
            copiedNote.textContent = "Не удалось скопировать — выделите вручную";
          }
        },
      },
      [el("span", { html: iconSvg("Copy", 16) }), "Скопировать ссылку"]
    ),
    copiedNote,
  ]);
  overlay.appendChild(dialog);

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
}
