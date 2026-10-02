import { el } from "../lib/dom.js";

export function Toggle(checked, onChange, { disabled = false } = {}) {
  return el(
    "button",
    {
      class: `settings-toggle ${checked ? "on" : ""} ${disabled ? "disabled" : ""}`,
      disabled,
      onclick: () => !disabled && onChange(!checked),
    },
    [el("span", { class: "settings-toggle-knob" })]
  );
}
