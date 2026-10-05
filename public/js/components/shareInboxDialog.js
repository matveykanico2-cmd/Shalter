import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import { showToast } from "./toast.js";
import { uploadFile } from "../lib/upload.js";
import { formatSize } from "../lib/uploadLimits.js";

const KINDS = ["image", "video", "audio"];

function kindFor(file) {
  const type = file?.type ?? "";
  for (const kind of KINDS) if (type.startsWith(`${kind}/`)) return kind;
  return "file";
}

function base64ToFile(payload) {
  const bin = atob(payload.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], payload.name || "shared", { type: payload.type || "application/octet-stream" });
}

// Окно «Поделиться в Shalter»: содержимое из системного меню «Поделиться»
// (ссылка, текст или файл) и список чатов — отправляем в выбранный.
export function openShareInboxDialog(share) {
  const { user, chats } = getState();
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const search = el("input", {
    class: "share-inbox-search",
    type: "text",
    placeholder: "Поиск чата",
    "aria-label": "Поиск чата",
    oninput: () => paintList(),
  });
  const list = el("div", { class: "share-inbox-list" });
  let query = "";
  let sending = false;

  const file = share.file ? base64ToFile(share.file) : null;
  const preview = el("div", { class: "share-inbox-preview" }, [
    file
      ? el("div", { class: "share-inbox-file" }, [
          el("span", { html: iconSvg(kindFor(file) === "image" ? "Image" : kindFor(file) === "video" ? "Video" : "Paperclip", 20) }),
          el("div", {}, [
            el("p", { class: "share-inbox-file-name" }, file.name),
            el("p", { class: "settings-toggle-hint" }, `${kindFor(file) === "image" ? "Фото" : kindFor(file) === "video" ? "Видео" : "Файл"} · ${formatSize(file.size)}`),
          ]),
        ])
      : el("p", { class: "share-inbox-text" }, share.text || share.url || ""),
    share.url && share.text
      ? el("p", { class: "share-inbox-link mono" }, share.url)
      : null,
  ]);

  async function sendTo(chat) {
    if (sending) return;
    sending = true;
    paintList();
    try {
      const attachments = file ? [await uploadFile(file, kindFor(file))] : [];
      const text = share.text && share.text !== share.url ? share.text : share.url ?? "";
      await api.sendMessage(chat.id, text, attachments.length ? { attachments } : {});
      close();
      navigate(`/chat/${chat.id}`);
      showToast(`Отправлено в «${chat.title ?? chat.name ?? "чат"}»`);
    } catch (err) {
      sending = false;
      paintList();
      showToast(err.message || "Не удалось отправить");
    }
  }

  function paintList() {
    clear(list);
    const q = query.trim().toLowerCase();
    const rows = (chats ?? [])
      .filter((c) => !c.archived && c.type !== "channel")
      .filter((c) => !q || `${c.title ?? c.name ?? ""} ${c.username ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
    if (!rows.length) {
      list.append(el("p", { class: "empty-hint" }, q ? "Ничего не найдено" : "Нет доступных чатов"));
      return;
    }
    for (const chat of rows) {
      list.append(
        el(
          "button",
          { class: "share-inbox-row", disabled: sending, onclick: () => sendTo(chat) },
          [
            el("span", { class: "share-inbox-avatar" }, (chat.title ?? chat.name ?? "?").trim().charAt(0).toUpperCase()),
            el("div", {}, [
              el("p", { class: "share-inbox-row-title" }, chat.title ?? chat.name ?? "Без названия"),
              el("p", { class: "settings-toggle-hint" }, chat.type === "group" ? "Группа" : "Личный чат"),
            ]),
          ]
        )
      );
    }
  }

  const dialog = el("div", { class: "modal-dialog share-inbox-dialog", role: "dialog", "aria-modal": "true" }, [
    el("h2", { class: "modal-title" }, "Поделиться в Shalter"),
    preview,
    search,
    list,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  document.addEventListener("keydown", onKey);
  paintList();
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  if (user) search.focus();
  return close;
}

// Точка входа маршрута /share/:token — содержимое забираем одноразово.
export async function openShareFromToken(token) {
  try {
    const { share } = await api.getSharePayload(token);
    if (!share?.text && !share?.url && !share?.file) return showToast("Нечего отправить");
    openShareInboxDialog(share);
  } catch (err) {
    showToast(err.message || "Ссылка устарела — поделитесь ещё раз");
    navigate("/", { replace: true });
  }
}