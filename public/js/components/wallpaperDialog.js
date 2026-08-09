import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { WALLPAPER_GROUPS } from "../lib/wallpapers.js";
import { fileToImageDataUrl } from "../lib/image.js";

// Per-chat wallpaper picker — opened from the chat header's "…" → "Фон
// чата" (see chatView.js's handleChooseWallpaper). Same catalog as Settings
// → Внешний вид's global picker (WALLPAPER_GROUPS), just scoped to one
// conversation: onSelect({id, image}) persists the override via
// api.setChatWallpaper, onSelect(null) resets the chat back to the global
// default.
export function openWallpaperDialog({ current, onSelect }) {
  let error = null;
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: (e) => pickCustom(e.target.files?.[0]),
  });

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "wallpaper-dialog-body" });
  const dialog = el("div", { class: "modal-dialog wallpaper-dialog" }, [
    el("h2", { class: "modal-title" }, "Фон чата"),
    body,
    el("div", { class: "wallpaper-dialog-footer" }, [
      el("button", { class: "modal-cancel", onclick: () => choose(null) }, "Сбросить"),
      el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
    ]),
    fileInput,
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  function choose(wallpaper) {
    close();
    onSelect(wallpaper);
  }

  async function pickCustom(file) {
    if (!file) return;
    try {
      const dataUrl = await fileToImageDataUrl(file, 1280);
      choose({ id: "custom", image: dataUrl });
    } catch (err) {
      error = err.message || "Не удалось загрузить фото";
      render();
    }
  }

  function render() {
    clear(body);
    for (const group of WALLPAPER_GROUPS) {
      body.appendChild(el("p", { class: "wallpaper-picker-group-label" }, group.label));
      body.appendChild(
        el(
          "div",
          { class: "wallpaper-picker-grid" },
          group.items.map((w) => {
            const active = w.id === "custom" ? current?.id === "custom" : !current ? false : current.id === w.id;
            return el(
              "button",
              {
                class: `wallpaper-picker-swatch ${active ? "active" : ""}`,
                title: w.label,
                onclick: () => (w.id === "custom" ? fileInput.click() : choose({ id: w.id })),
              },
              [
                el("span", {
                  // "message-list" is required here too — the actual .wallpaper-<id>
                  // rules in components.css are compound selectors
                  // (".message-list.wallpaper-default", not bare ".wallpaper-default"),
                  // same classes the real chat background uses, so this tiny
                  // swatch renders the real pattern instead of nothing.
                  class: `message-list wallpaper-picker-swatch-fill wallpaper-${w.id}`,
                  style:
                    w.id === "custom" && current?.id === "custom" && current.image
                      ? `background-image: url(${current.image})`
                      : undefined,
                  html:
                    w.id === "custom" && !(current?.id === "custom" && current.image)
                      ? iconSvg("Plus", 18, "wallpaper-picker-swatch-plus")
                      : undefined,
                }),
              ]
            );
          })
        )
      );
    }
    if (error) body.appendChild(el("p", { class: "login-error" }, error));
  }

  render();
  document.body.appendChild(overlay);
  return close;
}
