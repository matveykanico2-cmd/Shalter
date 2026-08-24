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

// onSaved — чтобы список ботов, из которого редактор открыли, узнал о новой
// версии кода: он загружается один раз при входе в раздел, и без этого метка
// «код» у бота появлялась только после ухода со страницы и возвращения назад.
export function openBotCodeDialog(bot, onSaved) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const editorSlot = el("div", { class: "bot-code-editor-slot" });
  const testInput = el("input", { class: "login-input", placeholder: "/start", value: "/start" });
  const outputSlot = el("div", { class: "bot-code-output" });
  const logsSlot = el("div", { class: "bot-code-logs" });
  const saveStatus = el("span", { class: "settings-toggle-hint" });
  // Шапка и кнопка «Сохранить» стоят вне прокручиваемого тела: тело раньше
  // было единственным содержимым окна с max-height: 90vh и без прокрутки — на
  // ноутбучном экране редактор с тестом и логами в эту высоту не влезал, и
  // нижняя часть окна просто обрезалась. Кнопка «Сохранить» оказывалась среди
  // обрезанного.
  const body = el("div", { class: "bot-code-body" }, [
    el(
      "p",
      { class: "settings-toggle-hint" },
      "Определите async function handleMessage(msg, bot) — она вызывается на каждое сообщение боту. Работает в песочнице: без доступа к файлам, процессу и сети, с таймаутом 20с (и 300мс на непрерывную работу процессора). Подробности — на странице /bots."
    ),
    editorSlot,
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
  const dialog = el("div", { class: "modal-dialog bot-code-dialog" }, [
    el("div", { class: "bot-code-header" }, [
      el("h2", { class: "modal-title" }, `Код бота «${bot.user?.name ?? bot.name ?? ""}»`),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
    ]),
    body,
    el("div", { class: "bot-code-actions" }, [
      el("button", { class: "btn-accent", onclick: save }, "Сохранить"),
      saveStatus,
    ]),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Редактор приезжает с CDN и потому создаётся асинхронно (lib/codeEditor.js).
  // Пока он едет, в окне висит надпись, а не пустое место; кнопки «Сохранить» и
  // «Запустить» до этого момента ничего не делают, а не падают на undefined.
  let editor = null;
  const loadingNote = el("p", { class: "settings-toggle-hint" }, "Загружаем редактор…");
  editorSlot.appendChild(loadingNote);
  // Код спрашивается у сервера, а не берётся из переданной записи бота. Запись
  // приходит из списка в настройках, который загружается один раз при входе в
  // раздел: написав и сохранив программу, редактор можно было закрыть и открыть
  // заново — и увидеть прежнюю версию, а у нового бота вместо только что
  // написанного кода снова шаблон. Ровно то место, где написанное «пропадало».
  api
    .getBot(bot.id)
    .then((r) => r.bot)
    .catch(() => bot)
    .then((fresh) => createCodeEditor(editorSlot, { value: fresh?.code?.trim() ? fresh.code : STARTER_CODE }))
    .then((made) => {
      loadingNote.remove();
      editor = made;
    })
    .catch(() => {
      loadingNote.textContent = "Не удалось загрузить редактор — проверьте соединение";
    });

  async function save() {
    if (!editor) return;
    saveStatus.textContent = "Сохраняем…";
    try {
      const code = editor.getValue();
      await api.saveBotCode(bot.id, code);
      saveStatus.textContent = "Сохранено ✓";
      onSaved?.(code);
    } catch (err) {
      saveStatus.textContent = err.message || "Не удалось сохранить";
    }
    setTimeout(() => (saveStatus.textContent = ""), 2000);
  }

  async function runTest() {
    clear(outputSlot);
    outputSlot.appendChild(el("p", { class: "settings-toggle-hint" }, "Выполняем…"));
    try {
      if (!editor) return;
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
    // Редактор приезжает с CDN — закрыть окно можно и до того, как он приедет
    // (или если он не приедет вовсе). Безусловный destroy() в этом случае падал
    // на undefined, и окно не закрывалось ни крестиком, ни щелчком по фону:
    // единственным выходом была перезагрузка страницы.
    editor?.destroy();
    overlay.remove();
  }
}
