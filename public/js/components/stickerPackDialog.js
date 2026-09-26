import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { SCENES } from "../lib/animScenes.js";
import { renderSticker } from "../lib/stickers.js";
import { prepareStickerImage } from "../lib/image.js";
import { uploadFile } from "../lib/upload.js";
import { openAnimatorEditor } from "./animatorEditor.js";
import { sceneSummaryEmoji } from "../lib/customScene.js";

// Building and editing your own sticker packs.
//
// Стикер в своём паке — одно из двух:
// - эмодзи со сценой (lib/animScenes.js) — те же анимации, что у встроенных;
// - своя картинка: фото, PNG без фона (фон так и остаётся прозрачным) или GIF
//   (двигается). Готовится в lib/image.js's prepareStickerImage.
const SCENE_CHOICES = [{ id: "", label: "Авто" }, ...Object.keys(SCENES).map((id) => ({ id, label: id.replace(/_/g, " ") }))];

export function openStickerPackDialog(onChanged) {
  let packs = [];
  let editing = null; // the pack being edited, or null for the list
  let draft = { name: "", stickers: [] };
  let error = null;
  let busy = false;
  // Сколько картинок сейчас загружается в пак.
  let uploadingCount = 0;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "sticker-pack-body" });
  const titleEl = el("h2", { class: "modal-title" }, "Стикерпаки");
  const dialog = el("div", { class: "modal-dialog sticker-pack-dialog" }, [
    titleEl,
    bodyEl,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  async function load() {
    try {
      ({ packs } = await api.listStickerPacks());
    } catch (err) {
      error = err.message || "Не удалось загрузить паки";
    }
    render();
  }

  function startNew() {
    editing = { id: null };
    draft = { name: "", stickers: [] };
    error = null;
    render();
  }

  function startEdit(pack) {
    editing = pack;
    draft = { name: pack.name, stickers: pack.stickers.map((s) => ({ ...s })) };
    error = null;
    render();
  }

  async function save() {
    if (busy) return;
    if (!draft.name.trim()) {
      error = "Назовите пак";
      return render();
    }
    if (!draft.stickers.length) {
      error = "Добавьте хотя бы один стикер";
      return render();
    }
    busy = true;
    error = null;
    render();
    try {
      if (editing.id) await api.updateStickerPack(editing.id, { name: draft.name, stickers: draft.stickers });
      else await api.createStickerPack({ name: draft.name, stickers: draft.stickers });
      ({ packs } = await api.listStickerPacks());
      editing = null;
      onChanged?.();
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    } finally {
      busy = false;
      render();
    }
  }

  async function removePack(pack) {
    try {
      await api.deleteStickerPack(pack.id);
      ({ packs } = await api.listStickerPacks());
      onChanged?.();
    } catch (err) {
      error = err.message || "Не удалось удалить";
    }
    render();
  }

  // The emoji field is deliberately a plain text input: a full emoji keyboard is
  // the platform's job, and every phone already has one.
  function editorView() {
    const nameInput = el("input", {
      class: "settings-input",
      placeholder: "Название пака",
      value: draft.name,
      oninput: (e) => (draft.name = e.target.value),
    });
    const emojiInput = el("input", { class: "settings-input sticker-emoji-input", placeholder: "😀", maxlength: 8 });
    const labelInput = el("input", { class: "settings-input", placeholder: "Подпись (необязательно)" });
    const sceneSelect = el(
      "select",
      { class: "settings-select" },
      SCENE_CHOICES.map((c) => el("option", { value: c.id }, c.label))
    );

    // Сразу несколько картинок — пак из десятка своих фото не должен
    // собираться десятью заходами в проводник.
    const imageInput = el("input", {
      type: "file",
      accept: "image/*",
      multiple: true,
      class: "hidden-input",
      onchange: async (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (!files.length) return;
        error = null;
        uploadingCount += files.length;
        render();
        // Загружаются параллельно, а в пак встают в том порядке, в каком их
        // выбрали, — не в том, в каком какая успела догрузиться.
        const results = await Promise.all(
          files.map(async (file) => {
            try {
              const { file: prepared, animated } = await prepareStickerImage(file);
              const { url } = await uploadFile(prepared, "image");
              return { sticker: { kind: "image", url, name: "", ...(animated ? { animated: true } : {}) } };
            } catch (err) {
              return { error: err.message || "Не удалось добавить картинку" };
            } finally {
              uploadingCount--;
              render();
            }
          })
        );
        for (const r of results) if (r.sticker) draft.stickers.push(r.sticker);
        const failures = results.filter((r) => r.error).map((r) => r.error);
        render();
        if (failures.length) {
          error = failures.length === files.length ? failures[0] : `Добавлено ${files.length - failures.length} из ${files.length}: ${failures[0]}`;
          render();
        }
      },
    });

    function addSticker() {
      const emoji = emojiInput.value.trim();
      if (!emoji) return;
      draft.stickers.push({ emoji, name: labelInput.value.trim(), ...(sceneSelect.value ? { scene: sceneSelect.value } : {}) });
      emojiInput.value = "";
      labelInput.value = "";
      render();
    }

    return [
      nameInput,
      el("p", { class: "settings-field-label" }, `Стикеры (${draft.stickers.length})`),
      draft.stickers.length
        ? el(
            "div",
            { class: "sticker-pack-grid" },
            draft.stickers.map((s, i) =>
              el("div", { class: "sticker-pack-cell" }, [
                renderSticker(s, { size: 40 }),
                el("button", {
                  class: "sticker-pack-remove",
                  title: "Убрать",
                  html: iconSvg("X", 12),
                  onclick: () => {
                    draft.stickers.splice(i, 1);
                    render();
                  },
                }),
              ])
            )
          )
        : el("p", { class: "moderation-empty" }, "Пока пусто — добавьте картинки или эмодзи ниже"),
      el("button", {
        class: "profile-action-btn sticker-add-image-btn",
        disabled: uploadingCount > 0,
        onclick: () => imageInput.click(),
      }, uploadingCount > 0 ? `Загружаем… (${uploadingCount})` : "Добавить фото, PNG без фона или GIF"),
      imageInput,
      el("button", {
        class: "profile-action-btn sticker-add-image-btn",
        onclick: () =>
          openAnimatorEditor({
            title: "Нарисовать стикер",
            saveLabel: "Добавить в пак",
            onSave: (scene) => {
              draft.stickers.push({ kind: "custom", scene, emoji: sceneSummaryEmoji(scene), name: "" });
              error = null;
              render();
            },
          }),
      }, "✏️ Нарисовать свою анимацию"),
      el("p", { class: "settings-field-label" }, "Или эмодзи с анимацией"),
      el("div", { class: "sticker-add-row" }, [emojiInput, labelInput]),
      el("div", { class: "sticker-add-row" }, [sceneSelect, el("button", { class: "btn-accent-pill", onclick: addSticker }, "Добавить")]),
      error ? el("p", { class: "login-error" }, error) : null,
      el(
        "button",
        { class: "btn-accent", disabled: busy || uploadingCount > 0, onclick: save },
        busy ? "Сохраняем…" : editing.id ? "Сохранить" : "Создать пак"
      ),
      el("button", { class: "modal-cancel", onclick: () => { editing = null; error = null; render(); } }, "Назад"),
    ].filter(Boolean);
  }

  function listView() {
    return [
      packs.length
        ? el(
            "div",
            { class: "sticker-pack-list" },
            packs.map((p) =>
              el("div", { class: "sticker-pack-row" }, [
                el(
                  "button",
                  { class: "sticker-pack-open", onclick: () => startEdit(p) },
                  [
                    el(
                      "span",
                      { class: "sticker-pack-preview" },
                      p.stickers.slice(0, 4).map((s) => renderSticker(s, { size: 22 }))
                    ),
                    el("span", { class: "sticker-pack-meta" }, [
                      el("span", { class: "sticker-pack-name" }, p.name),
                      el("span", { class: "sticker-pack-count" }, `${p.stickers.length} шт.`),
                    ]),
                  ]
                ),
                el("button", { class: "icon-btn", title: "Удалить", html: iconSvg("Trash", 15), onclick: () => removePack(p) }),
              ])
            )
          )
        : el("p", { class: "moderation-empty" }, "У вас пока нет своих паков"),
      error ? el("p", { class: "login-error" }, error) : null,
      el("button", { class: "btn-accent", onclick: startNew }, "Создать пак"),
    ].filter(Boolean);
  }

  function render() {
    clear(bodyEl);
    titleEl.textContent = editing ? (editing.id ? "Изменить пак" : "Новый пак") : "Стикерпаки";
    bodyEl.append(...(editing ? editorView() : listView()));
  }

  render();
  load();
}
