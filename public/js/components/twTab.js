import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { fileToImageDataUrl } from "../lib/image.js";

// Вкладка левой колонки tweb (SliderSuperTab): шапка с «Назад», прокручиваемое тело,
// круглая кнопка внизу справа. На компьютере ложится поверх списка чатов, на телефоне — на весь экран.
const stack = [];

function host(side) {
  if (!window.matchMedia("(min-width: 768px)").matches) return document.body;
  // Правая колонка (как sidebar-right в tweb) — поверх открытой панели информации о чате.
  if (side === "right") {
    const panel = document.querySelector(".info-panel-slot .info-panel")?.parentElement;
    if (panel && panel.offsetWidth) return panel;
  }
  return document.querySelector(".shell-sidebar") ?? document.body;
}

export function openSideTab({ title, content, fab, onClose, side }) {
  side ??= stack[stack.length - 1]?.side;
  const fabBtn = fab
    ? el("button", { class: "tw-tab-fab", title: fab.title ?? "", html: iconSvg(fab.icon ?? "ChevronRight", 26), onclick: () => fab.onClick?.(tab) })
    : null;
  const body = el("div", { class: "tw-tab-body" }, content);
  const titleEl = el("h2", { class: "tw-tab-title" }, title);
  const container = host(side);
  const root = el("div", { class: `tw-tab${container === document.body ? " tw-tab-full" : ""}` }, [
    el("div", { class: "tw-tab-header" }, [
      el("button", { class: "tw-tab-back", title: "Назад", html: iconSvg(stack.length ? "ChevronLeft" : "X", 24), onclick: () => tab.close() }),
      titleEl,
    ]),
    body,
    fabBtn,
  ]);

  function onKey(e) {
    if (e.key !== "Escape" || stack[stack.length - 1] !== tab || document.querySelector(".modal-overlay")) return;
    e.stopPropagation();
    tab.close();
  }

  const tab = {
    side,
    root,
    body,
    setTitle: (t) => (titleEl.textContent = t),
    setContent: (nodes) => body.replaceChildren(...[].concat(nodes).filter(Boolean)),
    setFabVisible: (v) => fabBtn?.classList.toggle("hidden", !v),
    setFabBusy: (v) => {
      if (!fabBtn) return;
      fabBtn.disabled = v;
      fabBtn.classList.toggle("busy", v);
    },
    close({ all = false } = {}) {
      const i = stack.indexOf(tab);
      if (i === -1) return;
      const closing = all ? stack.splice(0) : stack.splice(i);
      for (const t of closing.reverse()) {
        t.root.classList.add("closing");
        setTimeout(() => t.root.remove(), 200);
        t._cleanup();
      }
    },
    _cleanup() {
      document.removeEventListener("keydown", onKey, true);
      onClose?.();
    },
  };
  stack.push(tab);
  document.addEventListener("keydown", onKey, true);
  container.appendChild(root);
  requestAnimationFrame(() => root.querySelector("input:not([type=checkbox]):not([type=file]), textarea")?.focus({ preventScroll: true }));
  return tab;
}

export function closeAllSideTabs() {
  stack[0]?.close({ all: true });
}

// Поле tweb .input-field: подпись лежит на рамке, при фокусе рамка синяя.
export function twInputField({ label, value = "", multiline = false, maxLength, prefix, oninput, autofocus, inputClass = "" } = {}) {
  const input = el(multiline ? "textarea" : "input", {
    class: `tw-input ${inputClass}`,
    placeholder: " ",
    value,
    maxlength: maxLength ?? null,
    rows: multiline ? 1 : null,
    autofocus: autofocus || null,
    oninput: (e) => {
      if (multiline) {
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }
      if (counter) counter.textContent = String(maxLength - e.target.value.length);
      oninput?.(e);
    },
  });
  if (multiline) input.value = value;
  const counter = maxLength && multiline ? el("span", { class: "tw-input-counter" }, String(maxLength - value.length)) : null;
  const field = el("label", { class: `tw-input-field${prefix ? " has-prefix" : ""}` }, [
    prefix ? el("span", { class: "tw-input-prefix" }, prefix) : null,
    input,
    el("span", { class: "tw-input-label" }, label),
    counter,
  ]);
  return { field, input };
}

const CAMERA_ADD = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5H9.4L8 7H5.5A2.5 2.5 0 0 0 3 9.5v8A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5V11"/><circle cx="12" cy="13.5" r="3.5"/><path d="M19 3v6M16 6h6"/></svg>`;

// Круглый выбор аватарки с камерой (tweb AvatarEdit, 120px).
export function twAvatarEdit({ onChange, size = 120, initial = null } = {}) {
  let image = initial;
  const preview = el("span", { class: "tw-avatar-edit-preview" });
  if (initial) preview.replaceChildren(el("img", { src: initial, alt: "" }));
  const file = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      image = await fileToImageDataUrl(f, 512);
      preview.replaceChildren(el("img", { src: image, alt: "" }));
      btn.classList.add("has-image");
      onChange?.(image);
    },
  });
  const btn = el("button", { type: "button", class: `tw-avatar-edit${initial ? " has-image" : ""}`, style: `width:${size}px;height:${size}px`, title: "Выбрать фото", onclick: () => file.click() }, [
    preview,
    el("span", { class: "tw-avatar-edit-icon", html: CAMERA_ADD }),
    file,
  ]);
  return { element: btn, get image() { return image; } };
}

// Строка пользователя с круглой галочкой (tweb .row с checkbox-field-round).
export function twUserCheckRow(user, { checked, onToggle, subtitle, right } = {}) {
  const row = el("button", { type: "button", class: `tw-row clickable tw-check-user${checked ? " checked" : ""}`, onclick: () => onToggle(!row.classList.contains("checked"), row) }, [
    el("span", { class: "tw-check-user-avatar" }, [
      Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 42 }),
      el("span", { class: "tw-check-round", html: iconSvg("Check", 12) }),
    ]),
    el("span", { class: "tw-row-body" }, [
      el("span", { class: "tw-row-title" }, user.name),
      subtitle ? el("span", { class: "tw-row-subtitle" }, subtitle) : null,
    ]),
    right ?? null,
  ]);
  return row;
}
