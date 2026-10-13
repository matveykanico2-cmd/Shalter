import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { usernameUrl } from "../lib/publicLink.js";
import { showToast } from "./toast.js";

// Публичная ссылка канала / группы / профиля: крупно «shalter.ru/u/имя» (адрес
// сайта приглушён, имя — акцентом) и кнопки «Копировать», «Поделиться», «QR».
// owner — { name, username, avatarColor, avatarImage } для QR-карточки.
export function LinkCard(owner, { label = "Ссылка", copiedText = "Ссылка скопирована" } = {}) {
  const url = usernameUrl(owner.username);
  const [, host, path] = /^https?:\/\/([^/]+)(\/.*)$/.exec(url) ?? [null, url, ""];
  const name = path.replace(/^\/u\//, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(copiedText);
      card.classList.add("copied");
      setTimeout(() => card.classList.remove("copied"), 1200);
    } catch {
      showToast("Не удалось скопировать");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: owner.name || name, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    copy();
  };
  const qr = () => import("./profileQrDialog.js").then((m) => m.openProfileQrDialog(owner));

  const action = (icon, text, onClick) =>
    el("button", { class: "link-card-action", type: "button", onclick: (e) => (e.stopPropagation(), onClick()) }, [
      el("span", { class: "link-card-action-icon", html: iconSvg(icon, 18) }),
      el("span", {}, text),
    ]);

  const card = el("div", { class: "link-card" }, [
    el("button", { class: "link-card-main", type: "button", title: "Скопировать ссылку", onclick: copy }, [
      el("span", { class: "link-card-icon", html: iconSvg("Link", 20) }),
      el("span", { class: "link-card-text" }, [
        el("span", { class: "link-card-url" }, [el("span", { class: "link-card-host" }, `${host}/u/`), el("span", { class: "link-card-name" }, name)]),
        el("span", { class: "link-card-label" }, label),
      ]),
      el("span", { class: "link-card-copied", html: iconSvg("Check", 18) }),
    ]),
    el("div", { class: "link-card-actions" }, [action("Copy", "Копировать", copy), action("Share", "Поделиться", share), action("Qrcode", "QR-код", qr)]),
  ]);
  return card;
}
