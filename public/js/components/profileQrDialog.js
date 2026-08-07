import { el } from "../lib/dom.js";
import qrcode from "../lib/qrcode.js";

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 12, scalable: true });
}

// Scanning this with any camera opens /u/:username (see app.js's route),
// which resolves the account and starts a DM — same "scan to add contact"
// flow as /qr-login's "scan to sign in", just for a person instead of a
// device (see project_shalter_qr_login memory: real scannable QR, no
// in-app scanner needed).
export function openProfileQrDialog(username) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const url = `${window.location.origin}/u/${username}`;
  const copiedNote = el("p", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog qr-profile-dialog" }, [
    el("h2", { class: "modal-title" }, "QR-код профиля"),
    el("div", { class: "qr-login-code", html: qrSvg(url) }),
    el("p", { class: "mono qr-profile-username" }, `@${username}`),
    el("p", { class: "settings-toggle-hint" }, "Отсканируйте камерой телефона, чтобы сразу открыть чат с вами в Shalter."),
    el("button", {
      class: "btn-accent",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(url);
          copiedNote.textContent = "Ссылка скопирована ✓";
        } catch {
          copiedNote.textContent = "Не удалось скопировать — выделите вручную";
        }
      },
    }, "Скопировать ссылку"),
    copiedNote,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Готово"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
