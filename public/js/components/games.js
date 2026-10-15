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
function sdk(gameId, player, extra = {}) {
  const init = JSON.stringify({ store: readStore(gameId), player, ...extra }).replace(/</g, "\\u003c");
  return `<script>(function(){var I=${init};var data=I.store||{};
function post(m){try{parent.postMessage(Object.assign({__shalterGame:1},m),"*")}catch(e){}}
var mem={getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?String(data[k]):null},setItem:function(k,v){data[k]=String(v);post({type:"store",data:data})},removeItem:function(k){delete data[k];post({type:"store",data:data})},clear:function(){data={};post({type:"store",data:data})},key:function(i){return Object.keys(data)[i]||null},get length(){return Object.keys(data).length}};
try{Object.defineProperty(window,"localStorage",{value:mem,configurable:true})}catch(e){}
var last=-1,seq=0,wait={};
window.addEventListener("message",function(e){var d=e.data;if(!d||!d.__shalterGameReply||!wait[d.id])return;var w=wait[d.id];delete wait[d.id];d.error?w[1](new Error(d.error)):w[0](d.result)});
function rpc(method,args){return new Promise(function(ok,fail){var id=++seq;wait[id]=[ok,fail];post({type:"rpc",id:id,method:method,args:args||{}})})}
window.Shalter={version:1,player:I.player,theme:I.theme,chat:I.chat,
score:function(n){n=Math.floor(+n)||0;if(n!==last){last=n;post({type:"score",score:n})}},
gameOver:function(n){post({type:"over",score:Math.floor(+n)||0})},
getBest:function(){return rpc("best")},
getLeaderboard:function(o){return rpc("leaderboard",o)},
share:function(text){return rpc("share",{text:text==null?null:String(text).slice(0,300),score:last})},
vibrate:function(ms){return rpc("vibrate",{ms:Math.min(1000,Math.max(1,+ms||30))})},
ready:function(){post({type:"ready"})},
close:function(){post({type:"close"})}};
window.addEventListener("error",function(e){post({type:"error",message:String(e.message||e)})});})();<\/script>`;
}

function buildDoc(code, gameId, player, extra) {
  const inject = sdk(gameId, player, extra);
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
  if (!(code ?? game?.code)) {
    clear(frameSlot);
    frameSlot.append(el("p", { class: "game-error" }, "Игра ещё не загружена — отправьте код на своём сервере через Game API"));
    return close;
  }
  const gameId = game?.id ?? "preview";
  const me = getState().user;
  const frame = el("iframe", {
    class: "game-frame",
    sandbox: "allow-scripts allow-pointer-lock",
    allow: "fullscreen; gamepad; autoplay",
    title: game?.title ?? "Игра",
  });
  const dark = matchMedia?.("(prefers-color-scheme: dark)")?.matches || document.documentElement.dataset.theme === "dark";
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#3390ec";
  frame.srcdoc = buildDoc(code ?? game.code, gameId, { id: me?.id ?? null, name: me?.name ?? "Игрок" }, { theme: { dark, accent }, chat: chatId ? { id: chatId } : null });
  clear(frameSlot);
  frameSlot.append(frame);
  frame.focus();
  if (!code && game?.id) api.playGame(game.id).catch(() => {});

  let best = 0;
  let sendTimer = null;
  function onMessage(e) {
    if (e.source !== frame.contentWindow || !e.data?.__shalterGame) return;
    const m = e.data;
    if (m.type === "rpc") return void handleRpc(m);
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
  // Методы SDK, которым нужно приложение: рекорды, «поделиться», вибрация.
  async function handleRpc(m) {
    const reply = (result, error) => frame.contentWindow?.postMessage({ __shalterGameReply: 1, id: m.id, result, error }, "*");
    try {
      if (code || !game?.id) {
        if (m.method === "vibrate") navigator.vibrate?.(m.args.ms);
        return reply(m.method === "leaderboard" ? [] : m.method === "best" ? 0 : null);
      }
      if (m.method === "best") return reply((await api.getGameBest(game.id, chatId)).best ?? 0);
      if (m.method === "leaderboard") {
        const { scores } = await api.getGameScores(game.id, m.args?.chat === false ? null : chatId);
        return reply(scores.slice(0, Math.min(100, Number(m.args?.limit) || 20)).map((s2, i) => ({ position: i + 1, name: s2.name, score: s2.score, isMe: s2.userId === me?.id })));
      }
      if (m.method === "vibrate") {
        navigator.vibrate?.(m.args.ms);
        return reply(true);
      }
      if (m.method === "share") {
        if (!chatId) return reply(null, "Игра открыта не из чата — делиться некуда");
        const score = Math.max(0, Math.floor(Number(m.args?.score) || 0));
        const text = m.args?.text || `🎮 ${game.title}: мой результат — ${score}! Сможешь больше?`;
        await api.sendMessage(chatId, text, { attachments: [gameAttachmentFor(game)], clientId: `g_${Date.now().toString(36)}` });
        showToast("Результат отправлен в чат");
        return reply(true);
      }
      reply(null, `Неизвестный метод ${m.method}`);
    } catch (err) {
      reply(null, err.message || "Ошибка");
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
    if (!games.length)
      body.append(
        el(
          "p",
          { class: "dl-empty" },
          query ? "Ничего не найдено" : tab === "mine" ? "У вас пока нет своих игр — создавайте их на своём сервере и отправляйте карточки через Game API (см. /games)" : "Игр пока нет"
        )
      );
    for (const g of games) {
      body.append(
        el("div", { class: "game-tile" }, [
          el("span", { class: "game-tile-emoji" }, g.emoji || "🎮"),
          el("span", { class: "game-tile-title" }, g.title),
          el("span", { class: "game-tile-desc" }, g.description || (g.builtin ? "Встроенная игра" : g.isPublic ? "Игра сообщества" : "Только по ссылке")),
          el("div", { class: "game-tile-actions" }, [
            el("button", { class: "btn-accent", onclick: () => openGame(g, { chatId }) }, "Играть"),
            onPick ? el("button", { class: "modal-cancel", onclick: () => (close(), onPick(g)) }, "В чат") : null,
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

// Токен Game API: показывается один раз, новый отзывает прежний.
export async function showGameToken(game) {
  if (!(await askConfirm(`Создать API-токен для «${game.title}»? Прежний токен (если был) перестанет работать.`, { okLabel: "Создать" }))) return;
  let token;
  try {
    ({ token } = await api.createGameToken(game.id));
  } catch (err) {
    return showToast(err.message || "Не удалось создать токен");
  }
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && overlay.remove() });
  overlay.append(
    el("div", { class: "modal-dialog" }, [
      el("h2", { class: "modal-title" }, "🔑 Токен Game API"),
      el("p", { class: "settings-toggle-hint" }, "Сохраните его — повторно он не показывается. С ним можно обновлять игру, читать статистику и ставить рекорды со своего сервера."),
      el("code", { class: "game-token mono" }, token),
      el("div", { class: "game-editor-actions" }, [
        el("a", { class: "modal-cancel", href: "/games", target: "_blank" }, "Документация"),
        el("span", { style: "flex:1" }),
        el("button", { class: "btn-accent", onclick: () => navigator.clipboard?.writeText(token).then(() => showToast("Токен скопирован")) }, "Скопировать"),
      ]),
    ])
  );
  document.body.appendChild(overlay);
}

// Мини-приложение-игра: код хранится и отдаётся вашим сервером через Game API,
// а внутри Shalter игра открывается в iframe и общается через postMessage.
// Этот диалог — только метаданные (без редактора кода), как карточка бота.
export function openGameMetaDialog(game, { onSaved } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "edit-chat-body" });
  const dialog = el("div", { class: "modal-dialog edit-chat-dialog" }, [
    el("h2", { class: "modal-title" }, game ? "Игра" : "Новая игра"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const title = el("input", { class: "login-input", placeholder: "Название", maxLength: 64, value: game?.title ?? "" });
  const emoji = el("input", { class: "settings-input game-editor-emoji", placeholder: "🎮", maxLength: 4, value: game?.emoji ?? "🎮" });
  const desc = el("input", { class: "login-input", placeholder: "Короткое описание (необязательно)", maxLength: 200, value: game?.description ?? "" });
  const pub = el("input", { type: "checkbox", checked: !!game?.isPublic });

  let busy = false;
  let error = null;

  function close() {
    overlay.remove();
  }

  async function save() {
    if (busy) return;
    busy = true;
    error = null;
    render();
    try {
      const payload = { title: title.value.trim(), emoji: emoji.value.trim(), description: desc.value.trim(), isPublic: pub.checked };
      const res = game ? await api.updateGameMeta(game.id, payload) : await api.createGame({ ...payload, code: "" });
      onSaved?.(res.game);
      close();
    } catch (err) {
      error = err.message || "Не удалось сохранить";
      render();
    } finally {
      busy = false;
    }
  }

  function render() {
    clear(body);
    body.append(
      el("p", { class: "settings-toggle-hint" }, "Код игры загружайте на своём сервере через Game API — он не редактируется в этом диалоге."),
      el("p", { class: "settings-field-label" }, "Название"),
      title,
      el("p", { class: "settings-field-label" }, "Эмодзи"),
      emoji,
      el("p", { class: "settings-field-label" }, "Описание"),
      desc,
      el("label", { class: "game-editor-public" }, [pub, el("span", {}, "Показывать в каталоге игр для всех")]),
      error ? el("p", { class: "login-error" }, error) : null,
      el("button", { class: "btn-accent", disabled: busy, onclick: save }, busy ? "Сохраняем…" : "Сохранить")
    );
  }
  render();
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
