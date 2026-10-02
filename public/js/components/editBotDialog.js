import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";
import { fileToImageDataUrl } from "../lib/image.js";

export function openEditBotDialog(bot, onSaved) {
  let avatarImage = bot.user.avatarImage ?? null;
  let busy = false;
  let error = null;
  let notice = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "edit-chat-body" });
  const dialog = el("div", { class: "modal-dialog edit-chat-dialog" }, [
    el("h2", { class: "modal-title" }, "Настройки бота"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  const nameInput = el("input", { class: "login-input", value: bot.user.name ?? "" });
  const descInput = el("textarea", { class: "settings-input", rows: 3, value: bot.description ?? "" });
  const appUrlInput = el("input", { class: "login-input mono", placeholder: "https://example.com/app", value: bot.appUrl ?? "" });
  const appNameInput = el("input", { class: "login-input", placeholder: "Открыть приложение", value: bot.appName ?? "" });
  const appCodeInput = el("textarea", {
    class: "settings-input mono bot-app-code",
    rows: 8,
    spellcheck: false,
    placeholder: '<h1>Мой магазин</h1>\n<script>\n  const app = Shalter.WebApp;\n  app.ready();\n<\/script>',
    value: bot.appCode ?? "",
  });
  let appMode = bot.appCode ? "code" : bot.appUrl ? "url" : "none";
  const usernameInput = el("input", {
    class: "login-input mono",
    value: bot.user.username ?? "",
    oninput: (e) => {
      e.target.value = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "");
    },
  });
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      avatarImage = await fileToImageDataUrl(file, 512);
      render();
    },
  });

  async function save() {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const res = await api.updateBot(bot.id, {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
        username: usernameInput.value.trim(),
        avatarImage,
        appName: appNameInput.value.trim(),
        appUrl: appMode === "url" ? appUrlInput.value.trim() : "",
        appCode: appMode === "code" ? appCodeInput.value : "",
      });
      bot = { ...bot, ...res.bot };
      notice = "Сохранено";
      onSaved?.(bot);
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    clear(body);
    body.append(
      ...[
        el("div", { class: "edit-chat-avatar-row" }, [
          Avatar({ name: bot.user.name, color: bot.user.avatarColor, image: avatarImage, size: 64 }),
          el("div", { class: "edit-chat-avatar-actions" }, [
            el("button", { class: "profile-action-btn", onclick: () => fileInput.click() }, "Загрузить фото"),
            avatarImage ? el("button", { class: "profile-action-btn danger", onclick: () => { avatarImage = null; render(); } }, "Убрать фото") : null,
          ].filter(Boolean)),
          fileInput,
        ]),
        el("p", { class: "settings-field-label" }, "Имя"),
        nameInput,
        el("p", { class: "settings-field-label" }, "Юзернейм"),
        el("div", { class: "create-chat-handle" }, [el("span", { class: "create-chat-at" }, "@"), usernameInput]),
        el("p", { class: "settings-toggle-hint" }, "Должен заканчиваться на _bot — так его отличают от аккаунта человека."),
        el("p", { class: "settings-field-label" }, "Описание"),
        descInput,
        el("div", { class: "bot-app-block" }, [
          el("p", { class: "bot-app-title" }, "Мини-приложение"),
          el("p", { class: "settings-toggle-hint" }, [
            "Страница с интерфейсом, которая открывается внутри Shalter кнопкой в шапке чата и знает, кто её открыл — ",
            el("a", { href: "/bots#apps", target: "_blank", rel: "noreferrer" }, "как это устроено"),
            ".",
          ]),
          el(
            "div",
            { class: "bot-app-modes" },
            [
              { id: "none", label: "Нет" },
              { id: "code", label: "Написать здесь" },
              { id: "url", label: "Свой сервер" },
            ].map((m) =>
              el(
                "button",
                {
                  class: `bot-app-mode ${appMode === m.id ? "active" : ""}`,
                  onclick: () => {
                    appMode = m.id;
                    render();
                  },
                },
                m.label
              )
            )
          ),
          appMode === "code" ? appCodeInput : null,
          appMode === "code"
            ? el("p", { class: "settings-toggle-hint" }, [
                "HTML и JavaScript страницы. Хостинг не нужен: Shalter сам раздаст её по адресу ",
                el("span", { class: "mono" }, `/app/${bot.user.username ?? "…"}`),
                " и подставит скрипт ",
                el("span", { class: "mono" }, "Shalter.WebApp"),
                ". То же самое умеет Bot API — метод setWebAppCode.",
              ])
            : null,
          appMode === "url" ? appUrlInput : null,
          appMode === "url"
            ? el("p", { class: "settings-toggle-hint" }, "Адрес вашей страницы. Только https (http — для localhost).")
            : null,
          appMode !== "none" ? el("p", { class: "settings-field-label" }, "Надпись на кнопке") : null,
          appMode !== "none" ? appNameInput : null,
        ]),
        error ? el("p", { class: "login-error" }, error) : null,
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: save }, busy ? "Сохраняем…" : "Сохранить"),
      ].filter(Boolean)
    );
  }

  render();
}
