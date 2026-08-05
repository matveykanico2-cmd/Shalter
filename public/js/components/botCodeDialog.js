import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { createCodeEditor } from "../lib/codeEditor.js";

const STARTER_CODE = `// Called for every message someone sends this bot.
// msg: { text, chatId, senderId, createdAt }
// bot.send(text) replies in the same chat.
async function handleMessage(msg, bot) {
  if (msg.text === "/start") {
    return bot.send("Привет! Я бот, написанный прямо в Shalter.");
  }
  return bot.send("Вы написали: " + msg.text);
}
`;

function logLine(entry) {
  return el("p", { class: `bot-log-line ${entry.level === "error" ? "danger" : ""}` }, [
    el("span", { class: "mono bot-log-time" }, new Date(entry.at ?? Date.now()).toLocaleTimeString("ru-RU")),
    " ",
    entry.text,
  ]);
}

export function openBotCodeDialog(bot) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const editorSlot = el("div", { class: "bot-code-editor-slot" });
  const testInput = el("input", { class: "login-input", placeholder: "/start", value: "/start" });
  const outputSlot = el("div", { class: "bot-code-output" });
  const logsSlot = el("div", { class: "bot-code-logs" });
  const saveStatus = el("span", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog bot-code-dialog" }, [
    el("div", { class: "bot-code-header" }, [
      el("h2", { class: "modal-title" }, `Код бота «${bot.user?.name ?? bot.name ?? ""}»`),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
    ]),
    el(
      "p",
      { class: "settings-toggle-hint" },
      "Определите async function handleMessage(msg, bot) — она вызывается на каждое сообщение боту. bot.ai(prompt) даёт ИИ-ответ без своего API-ключа (если он настроен на сервере). Работает в песочнице: без доступа к файлам/процессу, с таймаутом 20с. Подробности — /BOTS.md."
    ),
    editorSlot,
    el("div", { class: "bot-code-actions" }, [
      el("button", { class: "btn-accent", onclick: save }, "Сохранить"),
      saveStatus,
    ]),
    el("div", { class: "bot-code-section" }, [
      el("p", { class: "settings-field-label" }, "Тест"),
      el("div", { class: "bot-code-test-row" }, [testInput, el("button", { class: "settings-add-account-btn", onclick: runTest }, "Запустить")]),
      outputSlot,
    ]),
    el("div", { class: "bot-code-section" }, [
      el("div", { class: "bot-code-logs-header" }, [
        el("p", { class: "settings-field-label" }, "Логи выполнения"),
        el("button", { class: "icon-btn", title: "Обновить", html: iconSvg("FlipCamera", 15), onclick: refreshLogs }),
      ]),
      logsSlot,
    ]),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const editor = createCodeEditor(editorSlot, { value: bot.code?.trim() ? bot.code : STARTER_CODE });

  async function save() {
    saveStatus.textContent = "Сохраняем…";
    try {
      await api.saveBotCode(bot.id, editor.getValue());
      saveStatus.textContent = "Сохранено ✓";
    } catch (err) {
      saveStatus.textContent = err.message || "Не удалось сохранить";
    }
    setTimeout(() => (saveStatus.textContent = ""), 2000);
  }

  async function runTest() {
    clear(outputSlot);
    outputSlot.appendChild(el("p", { class: "settings-toggle-hint" }, "Выполняем…"));
    try {
      const { logs, result, error } = await api.testBotCode(bot.id, editor.getValue(), testInput.value);
      clear(outputSlot);
      logs.forEach((l) => outputSlot.appendChild(logLine(l)));
      if (error) outputSlot.appendChild(el("p", { class: "bot-log-line danger" }, `Ошибка: ${error}`));
      else if (result !== undefined) outputSlot.appendChild(el("p", { class: "mono bot-log-line" }, `→ ${JSON.stringify(result)}`));
      refreshLogs();
    } catch (err) {
      clear(outputSlot);
      outputSlot.appendChild(el("p", { class: "bot-log-line danger" }, err.message || "Не удалось выполнить"));
    }
  }

  async function refreshLogs() {
    clear(logsSlot);
    try {
      const { logs } = await api.getBotLogs(bot.id);
      if (logs.length === 0) {
        logsSlot.appendChild(el("p", { class: "empty-hint" }, "Пока нет записей"));
      } else {
        [...logs].reverse().forEach((l) => logsSlot.appendChild(logLine(l)));
      }
    } catch {
      logsSlot.appendChild(el("p", { class: "empty-hint" }, "Не удалось загрузить логи"));
    }
  }
  refreshLogs();

  function close() {
    editor.destroy();
    overlay.remove();
  }
}
