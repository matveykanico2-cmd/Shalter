import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { renderScene, SCENES } from "../lib/animScenes.js";

// Building and editing your own sticker packs.
//
// A sticker here is an emoji plus an optional named scene (lib/animScenes.js) —
// the same performances the built-in stickers use, so a pack someone assembles
// animates exactly like the shipped ones rather than being a second-class
// static thing.
const SCENE_CHOICES = [{ id: "", label: "Авто" }, ...Object.keys(SCENES).map((id) => ({ id, label: id.replace(/_/g, " ") }))];

export function openStickerPackDialog(onChanged) {
  let packs = [];
  let editing = null; // the pack being edited, or null for the list
  let draft = { name: "", stickers: [] };
  let error = null;
  let busy = false;

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
                renderScene(s.emoji, { size: 40, preferred: s.scene, replay: false }),
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
        : el("p", { class: "moderation-empty" }, "Пока пусто — добавьте эмодзи ниже"),
      el("div", { class: "sticker-add-row" }, [emojiInput, labelInput]),
      el("div", { class: "sticker-add-row" }, [sceneSelect, el("button", { class: "btn-accent-pill", onclick: addSticker }, "Добавить")]),
      error ? el("p", { class: "login-error" }, error) : null,
      el("button", { class: "btn-accent", disabled: busy, onclick: save }, busy ? "Сохраняем…" : editing.id ? "Сохранить" : "Создать пак"),
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
                      p.stickers.slice(0, 4).map((s) => renderScene(s.emoji, { size: 22, preferred: s.scene, replay: false }))
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
