import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { formatSize } from "../lib/uploadLimits.js";
import { fileKind } from "../lib/mediaKind.js";

// Окно отправки вложений как в tweb (popups/newMedia): превью фото/видео альбомом
// или список файлов, подпись, «Отправить без сжатия», кнопка «Отправить».
export function openMediaSendPopup({ picks, caption = "", onSend, onCancel, allowPaid = false }) {
  let items = picks.slice();
  let asFiles = false;
  // Платный пост канала: цена в звёздах (0 — бесплатно).
  let paidStars = 0;
  // Спойлер: фото/видео размыто, пока получатель не нажмёт (бесплатно).
  let spoiler = false;
  const paidBar = el("div", { class: "tw-nm-paid", hidden: true });
  const urls = new Map();
  const urlFor = (file) => {
    if (!urls.has(file)) urls.set(file, URL.createObjectURL(file));
    return urls.get(file);
  };

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && cancel() });
  const titleEl = el("h2", { class: "tw-nm-title" });
  const preview = el("div", { class: "tw-nm-preview" });
  const captionInput = el("textarea", {
    class: "tw-nm-caption",
    placeholder: "Добавить подпись…",
    rows: 1,
    maxlength: 4096,
    oninput: () => fitCaption(),
    onkeydown: (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    },
  });
  captionInput.value = caption;
  // Поле подписи — одна строка, растёт с текстом до ~6 строк (как в Telegram).
  function fitCaption() {
    captionInput.style.height = "auto";
    captionInput.style.height = `${Math.min(captionInput.scrollHeight, 150)}px`;
  }
  const sendBtn = el("button", { class: "tw-nm-send", title: "Отправить", "aria-label": "Отправить", html: iconSvg("Send", 22), onclick: () => send() });

  const isMedia = (it) => (it.file.type.startsWith("image/") || it.file.type.startsWith("video/")) && !asFiles;

  function title() {
    const n = items.length;
    if (!n) return "Нечего отправлять";
    if (items.every(isMedia)) {
      const photos = items.filter((i) => i.file.type.startsWith("image/")).length;
      const videos = n - photos;
      if (!videos) return n === 1 ? "Отправить фото" : `Отправить ${n} фото`;
      if (!photos) return n === 1 ? "Отправить видео" : `Отправить ${n} видео`;
      return `Отправить ${n} ${plural(n, "медиафайл", "медиафайла", "медиафайлов")}`;
    }
    if (items.every((i) => i.file.type.startsWith("audio/"))) return n === 1 ? "Отправить аудио" : `Отправить ${n} аудио`;
    return n === 1 ? "Отправить файл" : `Отправить ${n} ${plural(n, "файл", "файла", "файлов")}`;
  }

  function removeBtn(i) {
    return el("button", {
      class: "tw-nm-remove",
      title: "Убрать",
      html: iconSvg("X", 16),
      onclick: (e) => {
        e.stopPropagation();
        items.splice(i, 1);
        if (!items.length) return cancel();
        render();
      },
    });
  }

  async function askPaidPrice() {
    const { askText } = await import("./confirmDialog.js");
    const raw = await askText("Сколько звёзд стоит открыть фото и видео?", paidStars ? String(paidStars) : "25", { okLabel: "Готово" });
    if (raw == null) return;
    const n = Math.floor(Number(String(raw).trim()));
    paidStars = Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : 0;
    if (paidStars) spoiler = false;
    render();
  }

  function render() {
    titleEl.textContent = title();
    paidBar.hidden = !paidStars && !spoiler;
    paidBar.replaceChildren(
      el("span", {}, paidStars ? `⭐ Фото и видео откроют за ${paidStars} звёзд` : "🫥 Фото и видео будут размыты — откроются по нажатию"),
      el("button", { type: "button", onclick: () => ((paidStars = 0), (spoiler = false), render()) }, "Убрать")
    );
    preview.classList.toggle("tw-nm-blurred", !!(paidStars || spoiler));
    const media = items.filter(isMedia);
    const docs = items.filter((i) => !isMedia(i));
    const nodes = [];
    if (media.length) {
      nodes.push(
        el(
          "div",
          { class: `tw-nm-album count-${Math.min(media.length, 4)}${media.length > 4 ? " many" : ""}` },
          media.map((it) => {
            const i = items.indexOf(it);
            const url = urlFor(it.file);
            return el("div", { class: "tw-nm-media" }, [
            it.file.type.startsWith("video/")
                ? el("video", { src: url, muted: true, playsInline: true, preload: "metadata" })
                : el("img", { src: url, alt: "" }),
            it.file.type.startsWith("video/") ? el("span", { class: "tw-nm-video-badge", html: iconSvg("PlayFill", 14) }) : null,
              removeBtn(i),
            ]);
          })
        )
      );
    }
    if (docs.length) {
      nodes.push(
        el(
          "div",
          { class: "tw-nm-docs" },
          docs.map((it) => {
            const i = items.indexOf(it);
            const isAudio = it.file.type.startsWith("audio/");
            const isImg = it.file.type.startsWith("image/");
            const ext = (it.file.name.split(".").pop() || "").slice(0, 4).toUpperCase();
            return el("div", { class: "tw-nm-doc" }, [
              isImg
                ? el("span", { class: "tw-nm-doc-thumb", style: `background-image:url("${urlFor(it.file)}")` })
                : el("span", { class: `tw-nm-doc-icon${isAudio ? " audio" : ""}`, html: isAudio ? iconSvg("PlayFill", 22) : "" }, isAudio ? null : ext || "FILE"),
              el("span", { class: "tw-nm-doc-body" }, [
                el("span", { class: "tw-nm-doc-name" }, it.file.name),
                el("span", { class: "tw-nm-doc-size" }, formatSize(it.file.size)),
              ]),
              removeBtn(i),
            ]);
          })
        )
      );
    }
    preview.replaceChildren(...nodes);
  }

  const hasCompressible = picks.some((p) => p.file.type.startsWith("image/") || p.file.type.startsWith("video/"));
  const moreBtn = hasCompressible
    ? el("button", {
        class: "tw-popup-close tw-nm-more",
        title: "Ещё",
        html: iconSvg("MoreVertical", 22),
        onclick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openDropdownMenu({ x: r.right - 220, y: r.bottom + 4 }, [
            asFiles
              ? { icon: "Image", label: "Отправить сжатым", onClick: () => ((asFiles = false), render()) }
              : { icon: "File", label: "Отправить без сжатия", onClick: () => ((asFiles = true), (paidStars = 0), render()) },
            !asFiles
              ? { icon: spoiler ? "Eye" : "EyeOff", label: spoiler ? "Убрать размытие" : "Скрыть под спойлер", onClick: () => ((spoiler = !spoiler), (paidStars = 0), render()) }
              : null,
            allowPaid && !asFiles
              ? { icon: "Star", label: paidStars ? "Изменить цену" : "Размыть за звёзды ⭐", onClick: () => askPaidPrice() }
              : null,
          ].filter(Boolean));
        },
      })
    : null;

  function close() {
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60_000);
  }
  function cancel() {
    close();
    onCancel?.(captionInput.value);
  }
  function send() {
    if (!items.length) return;
    const out = items.map((it) => ({ file: it.file, kind: fileKind(it.file) }));
    const text = captionInput.value;
    const paid = 0;
    close();
    onSend({ picks: out, caption: text, paidStars: paid, spoiler: false });
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      cancel();
    }
  }

  overlay.appendChild(
    el("div", { class: "modal-dialog tw-popup tw-nm-popup" }, [
      el("div", { class: "tw-nm-header" }, [
        el("button", { class: "tw-popup-close", title: "Закрыть", html: iconSvg("X", 22), onclick: cancel }),
        titleEl,
        moreBtn,
      ]),
      preview,
      paidBar,
      el("div", { class: "tw-nm-footer" }, [
        el("label", { class: "tw-nm-caption-field" }, [captionInput]),
        sendBtn,
      ]),
    ])
  );
  render();
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  fitCaption();
  captionInput.focus();
  captionInput.setSelectionRange(captionInput.value.length, captionInput.value.length);
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
