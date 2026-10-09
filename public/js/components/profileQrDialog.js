import { el } from "../lib/dom.js";
import { prettyQrSvg } from "../lib/prettyQr.js";
import { qrCardPng } from "../lib/qrCard.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openForwardDialog } from "./forwardDialog.js";
import { shareFileNative } from "../lib/nativeDownload.js";
import { uploadFile } from "../lib/upload.js";
import { api } from "../api.js";

// Темы как в tweb (popups/myQrCode): фон-градиент, код и имя — цветом темы.
// Цвета градиента по отдельности нужны картинке для «Поделиться».
const QR_THEMES = [
  { id: "blue", bg: "linear-gradient(135deg, #8fd0ff, #5b8cff 55%, #7c6cf0)", ink: "#2f5bd8", from: "#8fd0ff", via: "#5b8cff", to: "#7c6cf0" },
  { id: "violet", bg: "linear-gradient(135deg, #d7a6ff, #9b6cf5 55%, #6b5ce7)", ink: "#6a3fd1", from: "#d7a6ff", via: "#9b6cf5", to: "#6b5ce7" },
  { id: "pink", bg: "linear-gradient(135deg, #ffc1d9, #f57aa6 55%, #c85ce0)", ink: "#c0397a", from: "#ffc1d9", via: "#f57aa6", to: "#c85ce0" },
  { id: "orange", bg: "linear-gradient(135deg, #ffe08a, #ffad5c 55%, #f0735a)", ink: "#d5602b", from: "#ffe08a", via: "#ffad5c", to: "#f0735a" },
  { id: "green", bg: "linear-gradient(135deg, #c8f2a0, #6fd08c 55%, #33a9a0)", ink: "#23886f", from: "#c8f2a0", via: "#6fd08c", to: "#33a9a0" },
  { id: "night", bg: "linear-gradient(135deg, #3b4a6b, #23304d 55%, #151c2f)", ink: "#23304d", from: "#3b4a6b", via: "#23304d", to: "#151c2f" },
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

  // Поделиться кодом картинкой: системное меню умеет отдавать файл, поэтому
  // рисуем ту же карточку на canvas и отдаём PNG (или сохраняем файлом).
  async function cardFile() {
    const blob = await qrCardPng({
      url,
      name: user.name,
      username: user.username,
      theme: theme(),
      avatarImage: user.avatarImage,
      avatarColor: user.avatarColor,
      hint: "Отсканируйте, чтобы открыть профиль",
    });
    return new File([blob], `shalter-${user.username || "qr"}.png`, { type: "image/png" });
  }

  // Отправить код в чат Shalter — с выбором, кому.
  function sendToChat() {
    openForwardDialog(async (chatId) => {
      copiedNote.textContent = "Отправляем…";
      const attachment = await uploadFile(await cardFile(), "image");
      await api.sendMessage(chatId, url, { attachments: [attachment] });
      copiedNote.textContent = "QR-код отправлен ✓";
    });
  }

  async function shareImage() {
    copiedNote.textContent = "Готовим картинку…";
    try {
      const file = await cardFile();
      if (await shareFileNative(file, file.name, `${user.name} — Shalter ${url}`)) {
        copiedNote.textContent = "";
        return;
      }
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: user.name, text: `${user.name} — Shalter` });
        copiedNote.textContent = "Картинка отправлена ✓";
        return;
      }
      const href = URL.createObjectURL(file);
      const a = el("a", { href, download: file.name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      copiedNote.textContent = "Картинка сохранена ✓";
    } catch (err) {
      // Отмена системного меню — не ошибка (в браузере AbortError, в приложении «canceled»).
      copiedNote.textContent = err?.name === "AbortError" || /cancel/i.test(err?.message ?? "") ? "" : "Не удалось поделиться картинкой";
    }
  }

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
    el("div", { class: "qr-profile-actions" }, [
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
      el("button", { class: "btn-secondary", onclick: sendToChat }, [
        el("span", { html: iconSvg("Send", 16) }),
        "Отправить в чат",
      ]),
      el("button", { class: "btn-secondary", onclick: () => shareImage() }, [
        el("span", { html: iconSvg("Share", 16) }),
        "Поделиться",
      ]),
    ]),
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
