// Игры как в Telegram: HTML5-игра — один HTML-файл. Запускается в iframe с sandbox="allow-scripts"
// (без доступа к сайту, cookie и аккаунту) и общается с приложением через postMessage:
// Shalter.score(n), Shalter.gameOver(n) — перенос public/js/components/games.js.

const STORE_PREFIX = "shalter.game.";

export function readGameStore(gameId: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORE_PREFIX + gameId) || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeGameStore(gameId: string, data: unknown) {
  try {
    localStorage.setItem(STORE_PREFIX + gameId, JSON.stringify(data).slice(0, 100_000));
  } catch {
    // Хранилище недоступно (приватный режим) — игра просто не помнит прогресс.
  }
}

// SDK, который вставляется в игру перед её кодом.
function sdk(gameId: string, player: unknown, extra: Record<string, unknown>) {
  const init = JSON.stringify({ store: readGameStore(gameId), player, ...extra }).replace(/</g, "\\u003c");
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
window.addEventListener("error",function(e){post({type:"error",message:String(e.message||e)})});})();</script>`;
}

/** Документ для iframe: SDK перед кодом игры. */
export function buildGameDoc(code: string, gameId: string, player: unknown, extra: Record<string, unknown>) {
  const inject = sdk(gameId, player, extra);
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (m) => m + inject);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, (m) => m + inject);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${inject}</head><body>${code}</body></html>`;
}
