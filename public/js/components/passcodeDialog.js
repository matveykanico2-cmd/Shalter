import { el } from "../lib/dom.js";
import { verifyPasscode, setPasscode, removePasscode, hasPasscode } from "../lib/passcodeLock.js";

// Settings → Конфиденциальность → Код-пароль. Handles both "set for the
// first time" and "change" (the latter first requires the existing code) in
// one small self-contained modal — same shape as the delete-account dialog
// in settings/index.js, not worth a shared abstraction for two call sites.
export function openSetPasscodeDialog(onDone) {
  let step = hasPasscode() ? "current" : "new";
  let current = "";
  let next = "";
  let confirmVal = "";
  let error = null;
  let busy = false;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  function close() {
    overlay.remove();
  }

  async function submitCurrent() {
    busy = true;
    error = null;
    render();
    const ok = await verifyPasscode(current);
    busy = false;
    if (!ok) {
      error = "Неверный код-пароль";
      render();
      return;
    }
    step = "new";
    render();
  }

  function submitNew() {
    if (next.length < 4) {
      error = "Минимум 4 цифры";
      render();
      return;
    }
    error = null;
    step = "confirm";
    render();
  }

  async function submitConfirm() {
    if (confirmVal !== next) {
      error = "Коды не совпадают, попробуйте снова";
      next = "";
      confirmVal = "";
      step = "new";
      render();
      return;
    }
    await setPasscode(next);
    close();
    onDone();
  }

  function render() {
    let body;
    if (step === "current") {
      body = [
        el("p", { class: "settings-toggle-hint" }, "Введите текущий код-пароль"),
        el("input", {
          class: "login-input",
          type: "password",
          inputmode: "numeric",
          autofocus: true,
          value: current,
          oninput: (e) => (current = e.target.value),
          onkeydown: (e) => e.key === "Enter" && submitCurrent(),
        }),
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: submitCurrent }, "Далее"),
      ];
    } else if (step === "new") {
      body = [
        el("p", { class: "settings-toggle-hint" }, "Придумайте код-пароль (минимум 4 цифры)"),
        el("input", {
          class: "login-input",
          type: "password",
          inputmode: "numeric",
          autofocus: true,
          value: next,
          oninput: (e) => (next = e.target.value),
          onkeydown: (e) => e.key === "Enter" && submitNew(),
        }),
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", onclick: submitNew }, "Далее"),
      ];
    } else {
      body = [
        el("p", { class: "settings-toggle-hint" }, "Повторите код-пароль"),
        el("input", {
          class: "login-input",
          type: "password",
          inputmode: "numeric",
          autofocus: true,
          value: confirmVal,
          oninput: (e) => (confirmVal = e.target.value),
          onkeydown: (e) => e.key === "Enter" && submitConfirm(),
        }),
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", onclick: submitConfirm }, "Сохранить"),
      ];
    }
    const dialog = el("div", { class: "modal-dialog choice-dialog" }, [
      el("h2", { class: "modal-title" }, "Код-пароль"),
      ...body,
      el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
    ]);
    overlay.textContent = "";
    overlay.appendChild(dialog);
  }

  render();
  document.body.appendChild(overlay);
}

export function openRemovePasscodeDialog(onDone) {
  let code = "";
  let error = null;
  let busy = false;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  function close() {
    overlay.remove();
  }

  async function submit() {
    busy = true;
    error = null;
    render();
    const ok = await verifyPasscode(code);
    busy = false;
    if (!ok) {
      error = "Неверный код-пароль";
      render();
      return;
    }
    removePasscode();
    close();
    onDone();
  }

  function render() {
    const dialog = el("div", { class: "modal-dialog choice-dialog" }, [
      el("h2", { class: "modal-title" }, "Отключить код-пароль"),
      el("p", { class: "settings-toggle-hint" }, "Введите текущий код-пароль для подтверждения"),
      el("input", {
        class: "login-input",
        type: "password",
        inputmode: "numeric",
        autofocus: true,
        value: code,
        oninput: (e) => (code = e.target.value),
        onkeydown: (e) => e.key === "Enter" && submit(),
      }),
      error ? el("p", { class: "login-error" }, error) : null,
      el("button", { class: "choice-dialog-btn danger", disabled: busy, onclick: submit }, busy ? "Проверяем…" : "Отключить"),
      el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
    ]);
    overlay.textContent = "";
    overlay.appendChild(dialog);
  }

  render();
  document.body.appendChild(overlay);
}
