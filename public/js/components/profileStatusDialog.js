import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState, updateSelf } from "../state.js";
import { fileToImageDataUrl } from "../lib/image.js";

// Managing your own status wardrobe (Settings → Профиль → Статус): pick which
// of your own slots is shown next to your name, upload a new one, or add a
// ready-made one from the admin's catalog. Same "list + grid" shape as
// stickerPackDialog.js, reusing its grid/cell CSS rather than inventing a
// second one.
export function openProfileStatusDialog(onChanged) {
  let items = [];
  let activeId = null;
  let max = 1;
  let catalog = [];
  let error = null;
  let busy = false;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "sticker-pack-body" });
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // so picking the same file twice still fires
      if (file) uploadCustom(file);
    },
  });
  const dialog = el("div", { class: "modal-dialog sticker-pack-dialog" }, [
    el("h2", { class: "modal-title" }, "Статус"),
    bodyEl,
    fileInput,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  async function load() {
    try {
      const [mine, cat] = await Promise.all([api.listMyStatuses(), api.getStatusCatalog()]);
      items = mine.items;
      activeId = mine.activeId;
      max = mine.max;
      catalog = cat.items;
    } catch (err) {
      error = err.message || "Не удалось загрузить статусы";
    }
    render();
  }

  function applyUser(updated) {
    if (updated && getState().user?.id === updated.id) updateSelf(updated);
    onChanged?.();
  }

  async function run(fn) {
    busy = true;
    error = null;
    render();
    try {
      await fn();
    } catch (err) {
      error = err.message || "Не удалось";
    } finally {
      busy = false;
      render();
    }
  }

  const setActive = (id) =>
    run(async () => {
      const res = await api.setActiveStatus(id);
      activeId = res.activeId;
      applyUser(res.user);
    });

  const removeItem = (id) =>
    run(async () => {
      const res = await api.removeMyStatus(id);
      items = res.items;
      activeId = res.activeId;
      applyUser(res.user);
    });

  const addCatalog = (catalogId) =>
    run(async () => {
      const res = await api.addMyStatus({ catalogId });
      items = res.items;
      activeId = res.activeId;
      applyUser(res.user);
    });

  const uploadCustom = (file) =>
    run(async () => {
      // Tiny and square, same idea as an avatar poster — this is an icon
      // shown next to a name, not a photo.
      const image = await fileToImageDataUrl(file, 96, "image/png", 0.92);
      const res = await api.addMyStatus({ image });
      items = res.items;
      activeId = res.activeId;
      applyUser(res.user);
    });

  function render() {
    clear(bodyEl);
    const full = items.length >= max;

    bodyEl.appendChild(el("p", { class: "sticker-pack-heading" }, `Свои статусы — ${items.length} из ${max}`));
    bodyEl.appendChild(
      el("div", { class: "sticker-pack-grid" }, [
        el(
          "button",
          {
            class: `status-cell ${activeId == null ? "active" : ""}`,
            title: "Без статуса",
            disabled: busy,
            onclick: () => setActive(null),
          },
          [el("span", { class: "status-cell-none", html: iconSvg("X", 16) })]
        ),
        ...items.map((it) =>
          el("div", { class: "sticker-pack-cell status-cell-wrap" }, [
            el(
              "button",
              {
                class: `status-cell ${activeId === it.id ? "active" : ""}`,
                disabled: busy,
                title: it.name || "Статус",
                onclick: () => setActive(it.id),
              },
              [el("img", { class: "status-cell-img", src: it.image, alt: "" })]
            ),
            el(
              "button",
              { class: "sticker-pack-remove", title: "Удалить", disabled: busy, onclick: () => removeItem(it.id) },
              [el("span", { html: iconSvg("X", 10) })]
            ),
          ])
        ),
      ])
    );

    bodyEl.appendChild(
      el(
        "button",
        { class: "btn-accent", disabled: busy || full, onclick: () => fileInput.click() },
        full ? `Слотов больше нет (максимум ${max})` : "Загрузить своё изображение"
      )
    );
    if (max === 1) {
      bodyEl.appendChild(el("p", { class: "settings-toggle-hint" }, "С Shalter Premium — до 5 статусов вместо одного."));
    }
    if (error) bodyEl.appendChild(el("p", { class: "login-error" }, error));

    bodyEl.appendChild(el("p", { class: "sticker-pack-heading" }, "Готовые"));
    bodyEl.appendChild(
      el(
        "div",
        { class: "sticker-pack-grid" },
        catalog.length
          ? catalog.map((c) =>
              el(
                "button",
                { class: "status-cell", title: c.name || "Статус", disabled: busy || full, onclick: () => addCatalog(c.id) },
                [el("img", { class: "status-cell-img", src: c.image, alt: "" })]
              )
            )
          : [el("p", { class: "settings-toggle-hint" }, "Пока пусто")]
      )
    );
  }

  render();
  load();
  return close;
}
