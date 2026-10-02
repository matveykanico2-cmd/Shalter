import { el, clear } from "../lib/dom.js";
import { requestPushPermission } from "../lib/push.js";
import { isContactPickerSupported } from "../lib/phoneContacts.js";

const SEEN_KEY = "shalter.permissionsAsked";

export function permissionsAlreadyAsked() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markAsked() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
  }
}

async function askMedia(kind) {
  const constraints = kind === "camera" ? { video: true } : { audio: true };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getTracks().forEach((t) => t.stop());
}

export function openPermissionsDialog({ onDone } = {}) {
  const overlay = el("div", { class: "modal-overlay" });
  const body = el("div", { class: "perm-body" });
  const dialog = el("div", { class: "modal-dialog perm-dialog" }, [
    el("h2", { class: "modal-title" }, "Разрешения"),
    el("p", { class: "settings-toggle-hint" }, "Чтобы звонки, уведомления и фотографии работали сразу, а не спрашивали в самый неподходящий момент."),
    body,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const state = {};

  function close() {
    markAsked();
    overlay.remove();
    onDone?.();
  }

  const items = [
    {
      key: "notifications",
      title: "Уведомления",
      hint: "Сообщения и звонки, когда приложение закрыто",
      available: typeof Notification !== "undefined",
      run: async () => {
        const ok = await requestPushPermission();
        if (!ok) throw new Error("Отказано в браузере");
      },
    },
    {
      key: "mic",
      title: "Микрофон",
      hint: "Звонки и голосовые сообщения",
      available: !!navigator.mediaDevices?.getUserMedia,
      run: () => askMedia("mic"),
    },
    {
      key: "camera",
      title: "Камера",
      hint: "Видеозвонки, кружки и съёмка фото",
      available: !!navigator.mediaDevices?.getUserMedia,
      run: () => askMedia("camera"),
    },
    {
      key: "contacts",
      title: "Контакты",
      hint: isContactPickerSupported()
        ? "Найти знакомых, которые уже в Shalter"
        : "Этот браузер не умеет отдавать контакты — импорт доступен в мобильном приложении",
      available: isContactPickerSupported(),
      run: async () => {},
    },
  ];

  function render() {
    clear(body);
    for (const item of items) {
      const status = state[item.key];
      body.appendChild(
        el("div", { class: "perm-row" }, [
          el("div", { class: "perm-row-body" }, [
            el("p", { class: "perm-row-title" }, item.title),
            el("p", { class: "settings-toggle-hint" }, status && status !== "ok" ? status : item.hint),
          ]),
          status === "ok"
            ? el("span", { class: "perm-ok" }, "✓")
            : el(
                "button",
                {
                  class: "btn-accent-pill",
                  disabled: !item.available,
                  onclick: async () => {
                    try {
                      await item.run();
                      state[item.key] = "ok";
                    } catch (err) {
                      state[item.key] = err?.message === "Permission denied" ? "Отказано — можно включить в настройках браузера" : err?.message || "Не получилось";
                    }
                    render();
                  },
                },
                item.available ? "Разрешить" : "Недоступно"
              ),
        ])
      );
    }
    body.appendChild(
      el("p", { class: "settings-toggle-hint" }, "Показ поверх других приложений включается в настройках Android — в браузере такого разрешения нет.")
    );
    body.appendChild(
      el("div", { class: "perm-actions" }, [el("button", { class: "btn-secondary", onclick: close }, "Готово")])
    );
  }

  render();
  return { close };
}
