import { el } from "../lib/dom.js";
import { prettyQrSvg } from "../lib/prettyQr.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";

// Темы как в tweb (popups/myQrCode): фон-градиент, код и имя — цветом темы.
const QR_THEMES = [
  { id: "blue", bg: "linear-gradient(135deg, #8fd0ff, #5b8cff 55%, #7c6cf0)", ink: "#2f5bd8" },
  { id: "violet", bg: "linear-gradient(135deg, #d7a6ff, #9b6cf5 55%, #6b5ce7)", ink: "#6a3fd1" },
  { id: "pink", bg: "linear-gradient(135deg, #ffc1d9, #f57aa6 55%, #c85ce0)", ink: "#c0397a" },
  { id: "orange", bg: "linear-gradient(135deg, #ffe08a, #ffad5c 55%, #f0735a)", ink: "#d5602b" },
  { id: "green", bg: "linear-gradient(135deg, #c8f2a0, #6fd08c 55%, #33a9a0)", ink: "#23886f" },
  { id: "night", bg: "linear-gradient(135deg, #3b4a6b, #23304d 55%, #151c2f)", ink: "#23304d" },
];
const THEME_KEY = "shalter.qrTheme";
function qrSvg(text, ink) {
  return prettyQrSvg(text, { color: ink });
}

export function openProfileQrDialog(user) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const url = `${window.location.origin}/u/${user.username}`;
  const copiedNote = el("p", { class: "settings-toggle-hint" });

  let themeId = "blue";
  try {
    themeId = localStorage.getItem(THEME_KEY) || "blue";
  } catch {}
  const theme = () => QR_THEMES.find((t) => t.id === themeId) ?? QR_THEMES[0];
  const stage = el("div", { class: "qr-profile-stage" });
  const codeBox = el("div", { class: "qr-login-code" });
  const nameEl = el("p", { class: "mono qr-profile-username" }, `@${user.username}`);
  const swatches = el("div", { class: "qr-profile-themes" });
  function paint() {
    const t = theme();
    stage.style.background = t.bg;
    codeBox.innerHTML = qrSvg(url, t.ink);
    nameEl.style.color = t.ink;
    swatches.replaceChildren(
      ...QR_THEMES.map((x) =>
        el("button", {
          type: "button",
          class: `qr-profile-theme${x.id === themeId ? " active" : ""}`,
          style: { background: x.bg },
          title: "Тема",
          onclick: () => {
            themeId = x.id;
            try {
              localStorage.setItem(THEME_KEY, themeId);
            } catch {}
            paint();
          },
        })
      )
    );
  }
  const dialog = el("div", { class: "modal-dialog qr-profile-dialog" }, [
    el("div", { class: "qr-profile-header" }, [
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
      el("h2", { class: "modal-title" }, "QR-код"),
      el("span", { class: "qr-profile-header-spacer" }),
    ]),
    el("div", {}, [
      stage,
    ]),
    swatches,
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
  stage.append(
    el("div", { class: "qr-profile-card" }, [
      Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 64, className: "qr-profile-avatar" }),
      codeBox,
      nameEl,
    ])
  );
  paint();
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
