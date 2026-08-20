import { el } from "../lib/dom.js";
import { api } from "../api.js";

// The two "change what gets you in" dialogs: password and e-mail address.
//
// They sit together because they are the same act with different stakes, and
// because both start by asking for the current password — a live session is not
// proof that the person at the keyboard is the account's owner, only that the
// device was left signed in.

function overlayWith(title, hint, fields, submitLabel, onSubmit) {
  let busy = false;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const errorSlot = el("p", { class: "login-error" });
  const submit = el("button", { class: "btn-accent poll-create-btn" }, submitLabel);

  function close() {
    overlay.remove();
  }
  function fail(message) {
    errorSlot.textContent = message;
    busy = false;
    submit.disabled = false;
    submit.textContent = submitLabel;
  }

  submit.onclick = async () => {
    if (busy) return;
    busy = true;
    submit.disabled = true;
    submit.textContent = "Секунду…";
    errorSlot.textContent = "";
    try {
      await onSubmit({ close, fail });
    } catch (err) {
      fail(err.message || "Не получилось");
    }
  };

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    hint ? el("p", { class: "settings-toggle-hint" }, hint) : null,
    ...fields,
    errorSlot,
    submit,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  fields[0]?.querySelector?.("input")?.focus?.() ?? fields[0]?.focus?.();
  return { close, fail };
}

export function openChangePasswordDialog(onDone) {
  const current = el("input", { class: "login-input", type: "password", placeholder: "Текущий пароль", autofocus: true });
  const next = el("input", { class: "login-input", type: "password", placeholder: "Новый пароль" });
  const repeat = el("input", { class: "login-input", type: "password", placeholder: "Ещё раз новый пароль" });

  overlayWith(
    "Смена пароля",
    "Остальные сеансы будут завершены — на других устройствах придётся войти заново.",
    [current, next, repeat],
    "Сменить пароль",
    async ({ close, fail }) => {
      if (next.value.length < 6) return fail("Новый пароль — не короче 6 символов");
      // Checked here as well as on the server: a mistyped confirmation is the
      // one error worth catching before the old password stops working.
      if (next.value !== repeat.value) return fail("Пароли не совпадают");
      await api.changePassword(current.value, next.value);
      close();
      onDone?.();
    }
  );
}

export function openChangeEmailDialog(currentEmail, onDone) {
  const password = el("input", { class: "login-input", type: "password", placeholder: "Пароль", autofocus: true });
  const email = el("input", { class: "login-input", type: "email", placeholder: "Новый адрес почты", value: "" });

  // Один шаг: пароль и новый адрес. Кода подтверждения больше нет — значит
  // опечатка в адресе сохранится молча, и письмо для восстановления пароля
  // уйдёт не туда. Поэтому адрес показывается в подсказке ещё раз и просьба
  // проверить его стоит прямо перед кнопкой.
  overlayWith(
    "Смена почты",
    currentEmail
      ? `Сейчас: ${currentEmail}. Проверьте новый адрес: на него будет приходить восстановление доступа.`
      : "Проверьте адрес: на него будет приходить восстановление доступа.",
    [password, email],
    "Сменить почту",
    async ({ close, fail }) => {
      const address = email.value.trim();
      if (!address.includes("@")) return fail("Введите адрес почты");
      const { user } = await api.startEmailChange(password.value, address);
      close();
      onDone?.(user);
    }
  );
}


