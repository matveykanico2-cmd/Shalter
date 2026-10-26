import { askText } from "./confirmDialog.js";
import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { formatText } from "../lib/formatText.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { startChatAction, withChatAction } from "../lib/chatAction.js";
import { uploadFile } from "../lib/upload.js";
import { showToast } from "./toast.js";

export async function openArticleEditor({ chatId, onSend, initialArticle = null }) {
  const me = getState().user;
  if (!me?.isPremium) {
    showToast("Создание статей доступно только Premium-пользователям", { error: true });
    return;
  }

  let title = initialArticle?.title ?? "";
  let text = initialArticle?.text ?? "";
  let cover = initialArticle?.cover ?? null;
  let coverUrl = cover;
  let uploading = false;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "modal-dialog article-editor-dialog" }, [
    el("div", { class: "modal-header" }, [
      el("h2", { class: "modal-title" }, initialArticle ? "Редактировать статью" : "Создать статью"),
      el("button", { class: "modal-close", onclick: close, "aria-label": "Закрыть" }, iconSvg("X", 20)),
    ]),
    el("div", { class: "article-editor-body" }, [
      // Cover image
      el("div", { class: "article-cover-slot" }, [
        coverUrl
          ? el("div", { class: "article-cover-preview" }, [
              el("img", { src: coverUrl, alt: "" }),
              el("button", { class: "article-cover-remove", onclick: removeCover }, iconSvg("X", 16)),
            ])
          : el("button", { class: "article-cover-add", onclick: pickCover }, [
              el("span", { html: iconSvg("Image", 24) }),
              el("span", {}, "Добавить обложку"),
            ]),
      ]),
      // Title
      el("input", {
        class: "article-title-input",
        type: "text",
        placeholder: "Заголовок статьи",
        value: title,
        oninput: (e) => { title = e.target.value; updatePublishBtn(); },
      }),
      // Text editor
      el("div", { class: "article-toolbar" }, [
        el("button", { class: "toolbar-btn", title: "Жирный", onclick: () => wrapSelection("**", "**") }, iconSvg("Bold", 18)),
        el("button", { class: "toolbar-btn", title: "Курсив", onclick: () => wrapSelection("*", "*") }, iconSvg("Italic", 18)),
        el("button", { class: "toolbar-btn", title: "Код", onclick: () => wrapSelection("`", "`") }, iconSvg("Code", 18)),
        el("div", { class: "toolbar-divider" }),
        el("button", { class: "toolbar-btn", title: "Заголовок", onclick: () => insertLine("# ") }, "H1"),
        el("button", { class: "toolbar-btn", title: "Список", onclick: () => insertLine("- ") }, iconSvg("List", 18)),
        el("button", { class: "toolbar-btn", title: "Цитата", onclick: () => insertLine("> ") }, iconSvg("Quote", 18)),
        el("div", { class: "toolbar-divider" }),
        el("button", { class: "toolbar-btn", title: "Изображение", onclick: insertImage }, iconSvg("Image", 18)),
        el("button", { class: "toolbar-btn", title: "Ссылка", onclick: insertLink }, iconSvg("Link", 18)),
      ]),
      el("textarea", {
        class: "article-textarea",
        placeholder: "Напишите вашу статью…",
        value: text,
        oninput: (e) => { text = e.target.value; updatePublishBtn(); },
      }),
    ]),
    el("div", { class: "modal-footer" }, [
      el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
      el("button", { class: "btn-accent article-publish-btn", disabled: true, onclick: publish }, initialArticle ? "Сохранить" : "Опубликовать"),
    ]),
  ]);

  let textarea = dialog.querySelector(".article-textarea");
  let publishBtn = dialog.querySelector(".article-publish-btn");

  function updatePublishBtn() {
    const hasContent = title.trim() || text.trim();
    publishBtn.disabled = !hasContent || uploading;
    publishBtn.textContent = uploading ? "Публикация…" : (initialArticle ? "Сохранить" : "Опубликовать");
  }

  function wrapSelection(before, after) {
    const { selectionStart: a, selectionEnd: b, value } = textarea;
    if (a === b) {
      textarea.setRangeText(before + after, a, a, "select");
      textarea.selectionStart = a + before.length;
      textarea.selectionEnd = a + before.length;
    } else {
      const selected = value.slice(a, b);
      if (selected.startsWith(before) && selected.endsWith(after) && selected.length > before.length + after.length) {
        textarea.setRangeText(selected.slice(before.length, -after.length), a, b, "select");
      } else {
        textarea.setRangeText(before + selected + after, a, b, "select");
      }
    }
    textarea.focus();
  }

  function insertLine(prefix) {
    const { selectionStart: a, value } = textarea;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const lineEnd = value.indexOf("\n", a);
    const effectiveEnd = lineEnd === -1 ? value.length : lineEnd;
    if (value.slice(lineStart, lineStart + prefix.length) === prefix) {
      textarea.setRangeText("", lineStart, lineStart + prefix.length);
    } else {
      textarea.setRangeText(prefix, lineStart, lineStart);
    }
    textarea.focus();
  }

  async function insertImage() {
    const url = await askText("Ссылка на изображение:");
    if (url) wrapSelection("![](", `)${url}`);
  }

  async function insertLink() {
    const url = await askText("Ссылка:");
    if (url) wrapSelection("[", `](${url})`);
  }

  async function pickCover() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showToast("Файл слишком большой (макс. 10 МБ)", { error: true });
        return;
      }
      uploading = true;
      updatePublishBtn();
      try {
        const uploaded = await withChatAction(chatId, "upload_photo", uploadFile(file, "image"));
        cover = uploaded;
        coverUrl = uploaded.url;
        renderCover();
        showToast("Обложка загружена");
      } catch (err) {
        showToast(err.message || "Не удалось загрузить обложку", { error: true });
      } finally {
        uploading = false;
        updatePublishBtn();
      }
    };
    input.click();
  }

  function removeCover() {
    cover = null;
    coverUrl = null;
    renderCover();
  }

  function renderCover() {
    const slot = dialog.querySelector(".article-cover-slot");
    clear(slot);
    if (coverUrl) {
      slot.appendChild(
        el("div", { class: "article-cover-preview" }, [
          el("img", { src: coverUrl, alt: "" }),
          el("button", { class: "article-cover-remove", onclick: removeCover }, iconSvg("X", 16)),
        ])
      );
    } else {
      slot.appendChild(
        el("button", { class: "article-cover-add", onclick: pickCover }, [
          el("span", { html: iconSvg("Image", 24) }),
          el("span", {}, "Добавить обложку"),
        ])
      );
    }
  }

  async function publish() {
    if (!title.trim() && !text.trim()) return;
    uploading = true;
    updatePublishBtn();
    try {
      const article = {
        title: title.trim(),
        text: text.trim(),
        cover: cover?.url ?? null,
        customEmoji: [],
      };
      close();
      onSend(article);
    } catch (err) {
      showToast(err.message || "Не удалось опубликовать", { error: true });
    } finally {
      uploading = false;
      updatePublishBtn();
    }
  }

  function close() {
    overlay.remove();
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  textarea.focus();
}