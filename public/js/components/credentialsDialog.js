import { el } from "../lib/dom.js";
import { api } from "../api.js";

function overlayWith(title, hint, fields, submitLabel, onSubmit, onCancel) {
  let busy = false;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && cancel() });
  const errorSlot = el("p", { class: "login-error" });
  const submit = el("button", { class: "btn-accent poll-create-btn" }, submitLabel);

  function close() {
    overlay.remove();
  }
  function cancel() {
    close();
    onCancel?.();
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
    el("button", { class: "modal-cancel", onclick: () => cancel() }, "Отмена"),
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

  overlayWith(
    "Смена почты",
    currentEmail
      ? `Сейчас: ${currentEmail}. Проверьте новый адрес: на него будет приходить восстановление доступа.`
      : "Проверьте адрес: на него будет приходить восстановление доступа.",
    [password, email],
    "Получить код",
    async ({ close, fail }) => {
      const address = email.value.trim();
      if (!address.includes("@")) return fail("Введите адрес почты");
      const { email: sentTo } = await api.startEmailChange(password.value, address);
      close();
      openConfirmEmailDialog(sentTo ?? address, onDone);
    }
  );
}

// Второй шаг: адрес меняется только после кода из письма на новый адрес.
function openConfirmEmailDialog(address, onDone) {
  const code = el("input", {
    class: "login-input",
    type: "text",
    inputmode: "numeric",
    autocomplete: "one-time-code",
    maxlength: "6",
    placeholder: "Код из письма",
    autofocus: true,
  });

  overlayWith(
    "Подтвердите почту",
    `Мы отправили код на ${address}. Письмо может идти пару минут — проверьте и папку «Спам».`,
    [code],
    "Сменить почту",
    async ({ close, fail }) => {
      const value = code.value.trim();
      if (!/^\d{6}$/.test(value)) return fail("Введите шестизначный код из письма");
      const { user } = await api.confirmEmailChange(value);
      close();
      onDone?.(user);
    }
  );
}

// Смена номера телефона требует пароль от аккаунта (к номеру привязаны вход по коду
// и восстановление). save(password) повторяет сохранение; ошибка остаётся в диалоге.
// Промис — результат save или null, если закрыли.
export function askPasswordForPhoneChange(save) {
  return new Promise((resolve) => {
    const password = el("input", { class: "login-input", type: "password", placeholder: "Пароль", autocomplete: "current-password", autofocus: true });
    overlayWith(
      "Смена номера",
      "Чтобы сменить номер телефона, введите пароль от аккаунта.",
      [password],
      "Сменить номер",
      async ({ close, fail }) => {
        if (!password.value) return fail("Введите пароль");
        const result = await save(password.value);
        close();
        resolve(result);
      },
      () => resolve(null)
    );
  });
}
