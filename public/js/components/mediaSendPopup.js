import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { formatSize } from "../lib/uploadLimits.js";

// Окно отправки вложений как в tweb (popups/newMedia): превью фото/видео альбомом
// или список файлов, подпись, «Отправить без сжатия», кнопка «Отправить».
export function openMediaSendPopup({ picks, caption = "", onSend, onCancel }) {
  let items = picks.slice();
  let asFiles = false;
  const urls = new Map();
  const urlFor = (file) => {
    if (!urls.has(file)) urls.set(file, URL.createObjectURL(file));
    return urls.get(file);
  };

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && cancel() });
  const titleEl = el("h2", { class: "tw-nm-title" });
  const preview = el("div", { class: "tw-nm-preview" });
  const captionInput = el("textarea", {
    class: "tw-input tw-nm-caption",
    placeholder: " ",
    rows: 1,
    maxlength: 4096,
    oninput: (e) => {
      e.target.style.height = "auto";
      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    },
    onkeydown: (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    },
  });
  captionInput.value = caption;
  const sendBtn = el("button", { class: "tw-nm-send", onclick: () => send() }, "Отправить");

  const isMedia = (it) => (it.kind === "image" || it.kind === "video") && !asFiles;

  function title() {
    const n = items.length;
    if (!n) return "Нечего отправлять";
    if (items.every(isMedia)) {
      const photos = items.filter((i) => i.kind === "image").length;
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

  function render() {
    titleEl.textContent = title();
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
              it.kind === "video"
                ? el("video", { src: url, muted: true, playsInline: true, preload: "metadata" })
                : el("img", { src: url, alt: "" }),
              it.kind === "video" ? el("span", { class: "tw-nm-video-badge", html: iconSvg("PlayFill", 14) }) : null,
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
            const isImg = it.kind === "image" || it.file.type.startsWith("image/");
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

  const hasCompressible = picks.some((p) => p.kind === "image" || p.kind === "video");
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
              : { icon: "File", label: "Отправить без сжатия", onClick: () => ((asFiles = true), render()) },
          ]);
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
    const out = items.map((it) => ({ file: it.file, kind: asFiles ? "file" : it.kind }));
    const text = captionInput.value;
    close();
    onSend({ picks: out, caption: text });
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
      el("div", { class: "tw-nm-footer" }, [
        el("label", { class: "tw-input-field tw-nm-caption-field" }, [captionInput, el("span", { class: "tw-input-label" }, "Подпись")]),
        sendBtn,
      ]),
    ])
  );
  render();
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
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
