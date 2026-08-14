import { el } from "../lib/dom.js";

// The on/off switch used across Settings and the chat dialogs. It lived as a
// local helper inside views/settings/index.js; it's shared now rather than
// copied, so a second one can't drift into looking almost-the-same.
//
// Stateless by design: it renders `checked` and reports the flip. Whoever owns
// the state re-renders.
export function Toggle(checked, onChange) {
  return el("button", { class: `settings-toggle ${checked ? "on" : ""}`, onclick: () => onChange(!checked) }, [
    el("span", { class: "settings-toggle-knob" }),
  ]);
}
