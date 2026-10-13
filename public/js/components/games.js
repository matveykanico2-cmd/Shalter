import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { Avatar } from "./avatar.js";
import { showToast } from "./toast.js";
import { askConfirm } from "./confirmDialog.js";
import { pushOverlay } from "../router.js";

// Игры как в Telegram: HTML5-игра — один HTML-файл. Запускается в iframe с
// sandbox="allow-scripts" (без доступа к сайту, cookie и аккаунту) и общается с
// приложением через postMessage: Shalter.score(n), Shalter.gameOver(n).

const STORE_PREFIX = "shalter.game.";

function readStore(gameId) {
  try {
    return JSON.parse(localStorage.getItem(STORE_PREFIX + gameId) || "{}");
  } catch {
    return {};
  }
}
function writeStore(gameId, data) {
  try {
    localStorage.setItem(STORE_PREFIX + gameId, JSON.stringify(data).slice(0, 100_000) );
  } catch {}
}

// SDK, который вставляется в игру перед её кодом.
function sdk(gameId, player) {
  const init = JSON.stringify({ store: readStore(gameId), player }).replace(/</g, "\\u003c");
  return `<script>(function(){var I=${init};var data=I.store||{};
function post(m){try{parent.postMessage(Object.assign({__shalterGame:1},m),"*")}catch(e){}}
var mem={getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?String(data[k]):null},setItem:function(k,v){data[k]=String(v);post({type:"store",data:data})},removeItem:function(k){delete data[k];post({type:"store",data:data})},clear:function(){data={};post({type:"store",data:data})},key:function(i){return Object.keys(data)[i]||null},get length(){return Object.keys(data).length}};
try{Object.defineProperty(window,"localStorage",{value:mem,configurable:true})}catch(e){}
var last=-1;window.Shalter={player:I.player,score:function(n){n=Math.floor(+n)||0;if(n!==last){last=n;post({type:"score",score:n})}},gameOver:function(n){post({type:"over",score:Math.floor(+n)||0})},close:function(){post({type:"close"})}};
window.addEventListener("error",function(e){post({type:"error",message:String(e.message||e)})});})();<\/script>`;
}

function buildDoc(code, gameId, player) {
  const inject = sdk(gameId, player);
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (m) => m + inject);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, (m) => m + inject);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${inject}</head><body>${code}</body></html>`;
}

// Игровое окно. chatId — откуда запустили (рекорды этого чата). code — для
// предпросмотра в редакторе без сохранения.
export async function openGame(gameOrId, { chatId = null, code = null, onScore } = {}) {
  let game = typeof gameOrId === "string" ? null : gameOrId;
  const overlay = el("div", { class: "game-overlay" });
  const titleEl = el("span", { class: "game-title" }, game?.title ?? "Игра");
  const scoreEl = el("span", { class: "game-score mono" }, "");
  const frameSlot = el("div", { class: "game-frame-slot" }, [el("span", { class: "media-viewer-spinner" })]);
  let closed = false;
  let dropHistory = () => {};
  const close = (fromBack = false) => {
    if (closed) return;
    closed = true;
    window.removeEventListener("message", onMessage);
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
    if (fromBack !== true) dropHistory();
  };
  const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), close());
  overlay.append(
    el("div", { class: "game-head" }, [
      el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 22), onclick: () => close() }),
      el("span", { class: "game-emoji" }, game?.emoji ?? "🎮"),
      titleEl,
      scoreEl,
      code ? null : el("button", { class: "icon-btn", title: "Рекорды", html: iconSvg("BarChart", 20), onclick: () => openScores(game, chatId) }),
    ]),
    frameSlot
  );
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey, true);
  dropHistory = pushOverlay(() => close(true));

  try {
    if (!game?.code && code == null) game = (await api.getGame(game?.id ?? gameOrId)).game;
  } catch (err) {
    clear(frameSlot);
    frameSlot.append(el("p", { class: "game-error" }, err.message || "Игра не загрузилась"));
    return close;
  }
  titleEl.textContent = game?.title ?? "Предпросмотр";
  const gameId = game?.id ?? "preview";
  const me = getState().user;
  const frame = el("iframe", {
    class: "game-frame",
    sandbox: "allow-scripts allow-pointer-lock",
    allow: "fullscreen; gamepad; autoplay",
    title: game?.title ?? "Игра",
  });
  frame.srcdoc = buildDoc(code ?? game.code, gameId, { name: me?.name ?? "Игрок" });
  clear(frameSlot);
  frameSlot.append(frame);
  frame.focus();
  if (!code && game?.id) api.playGame(game.id).catch(() => {});

  let best = 0;
  let sendTimer = null;
  function onMessage(e) {
    if (e.source !== frame.contentWindow || !e.data?.__shalterGame) return;
    const m = e.data;
    if (m.type === "store" && !code) writeStore(gameId, m.data ?? {});
    else if (m.type === "close") close();
    else if (m.type === "error" && code) showToast(`Ошибка в игре: ${String(m.message).slice(0, 160)}`);
    else if (m.type === "score" || m.type === "over") {
      const score = Math.max(0, Math.floor(Number(m.score) || 0));
      scoreEl.textContent = String(score);
      onScore?.(score);
      if (code || !game?.id || score <= best) return;
      best = score;
      // Счёт приходит часто — шлём лучший не чаще раза в 2 с и сразу в конце игры.
      clearTimeout(sendTimer);
      const send = () =>
        api
          .submitGameScore(game.id, best, chatId)
          .then((r) => r.improved && m.type === "over" && showToast(`Новый рекорд: ${r.best}!`))
          .catch(() => {});
      if (m.type === "over") send();
      else sendTimer = setTimeout(send, 2000);
    }
  }
  window.addEventListener("message", onMessage);
  return close;
}

export async function openScores(game, chatId = null) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && overlay.remove() });
  const list = el("div", { class: "game-scores" }, [el("span", { class: "qr-login-spinner" })]);
  overlay.append(
    el("div", { class: "modal-dialog game-scores-dialog" }, [
      el("h2", { class: "modal-title" }, `${game?.emoji ?? "🎮"} Рекорды · ${game?.title ?? ""}`),
      chatId ? el("p", { class: "settings-toggle-hint" }, "Лучшие результаты в этом чате") : null,
      list,
      el("button", { class: "modal-cancel", onclick: () => overlay.remove() }, "Закрыть"),
    ])
  );
  document.body.appendChild(overlay);
  try {
    const { scores } = await api.getGameScores(game.id, chatId);
    clear(list);
    if (!scores.length) list.append(el("p", { class: "dl-empty" }, "Пока никто не играл — будьте первым!"));
    scores.forEach((s, i) =>
      list.append(
        el("div", { class: "game-score-row" }, [
          el("span", { class: "game-score-place" }, i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1)),
          Avatar({ name: s.name, color: s.avatarColor, image: s.avatarImage, size: 32 }),
          el("span", { class: "game-score-name" }, s.name),
          el("b", { class: "mono" }, String(s.score)),
        ])
      )
    );
  } catch (err) {
    clear(list);
    list.append(el("p", { class: "login-error" }, err.message || "Не удалось загрузить рекорды"));
  }
}

// Каталог: встроенные игры, игры сообщества и свои. onPick — отправить карточку в чат.
export function openGamesCatalog({ onPick = null, chatId = null } = {}) {
  let tab = "all";
  let query = "";
  let searchTimer = null;
  const search = el("input", {
    class: "settings-input dl-search",
    placeholder: "Поиск игр",
    oninput: (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => ((query = e.target.value.trim()), render()), 250);
    },
  });
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "games-grid" });
  const tabs = el("div", { class: "dl-tabs" });
  const close = () => overlay.remove();

  async function render() {
    clear(tabs);
    for (const [id, label] of [["all", "Все игры"], ["mine", "Мои игры"]]) tabs.append(el("button", { class: `dl-tab${tab === id ? " active" : ""}`, onclick: () => ((tab = id), render()) }, label));
    clear(body);
    body.append(el("span", { class: "qr-login-spinner" }));
    let games = [];
    try {
      games = (tab === "mine" ? await api.myGames() : await api.listGames(query)).games;
      if (tab === "mine" && query) games = games.filter((g) => `${g.title} ${g.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
    } catch (err) {
      clear(body);
      body.append(el("p", { class: "login-error" }, err.message || "Не удалось загрузить игры"));
      return;
    }
    clear(body);
    if (tab === "mine")
      body.append(
        el("button", { class: "game-tile game-tile-new", onclick: () => (close(), openGameEditor(null, { onSaved: () => openGamesCatalog({ onPick, chatId }) })) }, [
          el("span", { class: "game-tile-emoji", html: iconSvg("Plus", 28) }),
          el("span", { class: "game-tile-title" }, "Создать игру"),
          el("span", { class: "game-tile-desc" }, "Напишите свою игру на HTML и JavaScript"),
        ])
      );
    if (!games.length) body.append(el("p", { class: "dl-empty" }, query ? "Ничего не найдено" : tab === "mine" ? "У вас пока нет своих игр" : "Игр пока нет"));
    for (const g of games) {
      body.append(
        el("div", { class: "game-tile" }, [
          el("span", { class: "game-tile-emoji" }, g.emoji || "🎮"),
          el("span", { class: "game-tile-title" }, g.title),
          el("span", { class: "game-tile-desc" }, g.description || (g.builtin ? "Встроенная игра" : g.isPublic ? "Игра сообщества" : "Только по ссылке")),
          el("div", { class: "game-tile-actions" }, [
            el("button", { class: "btn-accent", onclick: () => openGame(g, { chatId }) }, "Играть"),
            onPick ? el("button", { class: "modal-cancel", onclick: () => (close(), onPick(g)) }, "В чат") : null,
            tab === "mine" ? el("button", { class: "icon-btn", title: "Редактировать", html: iconSvg("Edit", 18), onclick: () => (close(), openGameEditor(g, { onSaved: () => openGamesCatalog({ onPick, chatId }) })) }) : null,
          ]),
        ])
      );
    }
  }

  overlay.append(
    el("div", { class: "modal-dialog games-dialog" }, [
      el("div", { class: "dl-head" }, [el("h2", { class: "modal-title" }, "🎮 Игры"), el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: close })]),
      search,
      tabs,
      body,
    ])
  );
  document.body.appendChild(overlay);
  render();
}

const STARTER = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  html, body { margin: 0; height: 100%; display: flex; align-items: center; justify-content: center;
    flex-direction: column; font-family: system-ui; background: #1e1e2e; color: #fff; user-select: none; }
  #target { width: 90px; height: 90px; border-radius: 50%; background: #ff6b6b; position: absolute; cursor: pointer; }
</style>
</head>
<body>
<h2>Очки: <span id="score">0</span> · ⏱ <span id="time">20</span></h2>
<div id="target"></div>
<script>
  // Shalter.score(n) — текущий счёт, Shalter.gameOver(n) — конец игры (рекорд сохранится).
  // Shalter.player.name — имя игрока. localStorage работает как обычно.
  let score = 0, time = 20;
  const target = document.getElementById("target");
  function moveTarget() {
    target.style.left = Math.random() * (innerWidth - 90) + "px";
    target.style.top = 80 + Math.random() * (innerHeight - 170) + "px";
  }
  target.onpointerdown = () => {
    score++;
    document.getElementById("score").textContent = score;
    Shalter.score(score);
    moveTarget();
  };
  const timer = setInterval(() => {
    time--;
    document.getElementById("time").textContent = time;
    if (time <= 0) {
      clearInterval(timer);
      target.remove();
      Shalter.gameOver(score);
    }
  }, 1000);
  moveTarget();
</script>
</body>
</html>
`;

// Редактор своей игры: код, название, эмодзи, «в каталоге для всех», предпросмотр.
export async function openGameEditor(game, { onSaved } = {}) {
  let full = game;
  if (game?.id && game.code == null) {
    try {
      full = (await api.getGame(game.id)).game;
    } catch (err) {
      return showToast(err.message || "Не удалось открыть игру");
    }
  }
  const overlay = el("div", { class: "modal-overlay" });
  const title = el("input", { class: "settings-input", placeholder: "Название", maxLength: 64, value: full?.title ?? "" });
  const emoji = el("input", { class: "settings-input game-editor-emoji", placeholder: "🎮", maxLength: 4, value: full?.emoji ?? "🎮" });
  const desc = el("input", { class: "settings-input", placeholder: "Короткое описание", maxLength: 200, value: full?.description ?? "" });
  const pub = el("input", { type: "checkbox", checked: !!full?.isPublic });
  const editorSlot = el("div", { class: "game-editor-code" });
  const fallback = el("textarea", { class: "settings-input game-editor-textarea mono", spellcheck: false }, full?.code ?? STARTER);
  let editor = null;
  const getCode = () => (editor ? editor.getValue() : fallback.value);
  const close = () => {
    editor?.destroy?.();
    overlay.remove();
  };
  const save = async () => {
    const payload = { title: title.value, emoji: emoji.value, description: desc.value, isPublic: pub.checked, code: getCode() };
    try {
      const res = full?.id ? await api.updateGame(full.id, payload) : await api.createGame(payload);
      full = res.game;
      showToast("Игра сохранена");
      close();
      onSaved?.(full);
    } catch (err) {
      showToast(err.message || "Не удалось сохранить");
    }
  };
  overlay.append(
    el("div", { class: "modal-dialog game-editor" }, [
      el("div", { class: "dl-head" }, [
        el("h2", { class: "modal-title" }, full?.id ? "Редактор игры" : "Новая игра"),
        el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: close }),
      ]),
      el("div", { class: "game-editor-meta" }, [emoji, title]),
      desc,
      el("label", { class: "game-editor-public" }, [pub, el("span", {}, "Показывать в каталоге игр для всех")]),
      el("p", { class: "settings-toggle-hint" }, "Игра — HTML-страница. Вызывайте Shalter.score(очки) и Shalter.gameOver(очки), чтобы работали рекорды."),
      editorSlot,
      el("div", { class: "game-editor-actions" }, [
        full?.id
          ? el("button", {
              class: "modal-cancel danger",
              onclick: async () => {
                if (!(await askConfirm(`Удалить игру «${full.title}»?`, { okLabel: "Удалить", danger: true }))) return;
                await api.deleteGame(full.id).catch(() => {});
                close();
                onSaved?.(null);
              },
            }, "Удалить")
          : null,
        el("span", { style: "flex:1" }),
        el("button", { class: "modal-cancel", onclick: () => openGame({ title: title.value || "Предпросмотр", emoji: emoji.value }, { code: getCode() }) }, "▶ Запустить"),
        el("button", { class: "btn-accent", onclick: save }, "Сохранить"),
      ]),
    ])
  );
  document.body.appendChild(overlay);
  try {
    const { createCodeEditor } = await import("../lib/codeEditor.js");
    editor = await createCodeEditor(editorSlot, { value: full?.code ?? STARTER });
  } catch {
    editorSlot.append(fallback);
  }
}

// Карточка игры в сообщении.
export function GameAttachment(message, a) {
  const meta = a.meta ?? {};
  const game = { id: meta.gameId, title: meta.title, emoji: meta.emoji };
  return el("div", { class: "game-card" }, [
    el("div", { class: "game-card-cover" }, [el("span", { class: "game-card-emoji" }, meta.emoji || "🎮")]),
    el("div", { class: "game-card-body" }, [
      el("p", { class: "game-card-title" }, meta.title || "Игра"),
      meta.description ? el("p", { class: "game-card-desc" }, meta.description) : null,
      el("div", { class: "game-card-actions" }, [
        el("button", { class: "btn-accent", onclick: (e) => (e.stopPropagation(), openGame(game, { chatId: message.chatId })) }, "▶ Играть"),
        el("button", { class: "modal-cancel", onclick: (e) => (e.stopPropagation(), openScores(game, message.chatId)) }, "🏆 Рекорды"),
      ]),
    ]),
  ]);
}

export function gameAttachmentFor(g) {
  return { kind: "game", meta: { gameId: g.id, title: g.title, emoji: g.emoji || "🎮", description: g.description || "" } };
}
