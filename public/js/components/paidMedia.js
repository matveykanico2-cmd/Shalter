import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { ImageAttachment, VideoAttachment } from "./attachments.js";
import { starIconSvg, openStarsDialog } from "./starsDialog.js";
import { askConfirm } from "./confirmDialog.js";
import { showToast } from "./toast.js";

// Платный пост канала: фото и видео размыты, пока подписчик не откроет их за
// звёзды. Настоящие вложения сервер отдаёт только автору, админам и купившим.
const unlocked = new Map(); // messageId → attachments | "locked"

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function contentLabel({ photos = 0, videos = 0 }) {
  const parts = [];
  if (photos) parts.push(`${photos} ${plural(photos, "фото", "фото", "фото")}`);
  if (videos) parts.push(`${videos} ${plural(videos, "видео", "видео", "видео")}`);
  return parts.join(" · ") || "Медиа";
}

function renderMedia(attachments) {
  const media = attachments.map((a) => (a.kind === "video" ? VideoAttachment(a) : ImageAttachment(a)));
  if (media.length === 1) return media[0];
  const n = Math.min(media.length, 4);
  return el(
    "div",
    { class: `message-album album-${n}${media.length > 4 ? " album-many" : ""}` },
    media.map((m) => el("div", { class: "message-album-cell" }, [m]))
  );
}

export function PaidMediaAttachment(message, a, { mine = false } = {}) {
  const meta = a.meta ?? {};
  const box = el("div", { class: "paid-media" });
  if (meta.width && meta.height) box.style.aspectRatio = `${meta.width} / ${meta.height}`;

  const showUnlocked = (atts) => {
    unlocked.set(message.id, atts);
    box.classList.add("is-open");
    box.style.aspectRatio = "";
    clear(box);
    box.append(renderMedia(atts), el("span", { class: "paid-media-badge", html: `${starIconSvg()} ${meta.stars}` }));
  };

  const unlock = async (e) => {
    e?.stopPropagation();
    const ok = await askConfirm(`Открыть ${contentLabel(meta).toLowerCase()} за ${meta.stars} ⭐? Звёзды получит автор канала.`, { okLabel: `Открыть за ${meta.stars} ⭐` });
    if (!ok) return;
    try {
      const res = await api.unlockPaidMedia(message.chatId, message.id);
      showUnlocked(res.attachments ?? []);
      showToast("Пост открыт");
    } catch (err) {
      if (err.status === 402) {
        showToast(err.message || "Не хватает звёзд");
        openStarsDialog();
      } else showToast(err.message || "Не удалось открыть пост");
    }
  };

  const showLocked = () => {
    clear(box);
    box.classList.remove("is-open");
    box.append(
      el("span", { class: "paid-media-blur", style: meta.blur ? `background-image:url("${meta.blur}")` : "" }),
      el("span", { class: "paid-media-shade" }),
      el("button", { class: "paid-media-unlock", type: "button", onclick: unlock }, [
        el("span", { class: "paid-media-unlock-star", html: starIconSvg() }),
        el("span", {}, `Открыть за ${meta.stars}`),
      ]),
      el("span", { class: "paid-media-label" }, contentLabel(meta))
    );
  };

  const known = unlocked.get(message.id);
  if (Array.isArray(known)) showUnlocked(known);
  else {
    showLocked();
    if (known !== "locked" && !String(message.id).startsWith("local_")) {
      // Автор, админы и купившие видят содержимое сразу.
      api
        .getPaidMedia(message.chatId, message.id)
        .then((res) => box.isConnected !== false && showUnlocked(res.attachments ?? []))
        .catch((err) => {
          if (err.status === 402) unlocked.set(message.id, "locked");
        });
    }
  }
  if (mine) box.classList.add("mine");
  return box;
}
