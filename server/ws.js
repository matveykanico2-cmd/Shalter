// События старого кода для клиентов. Сокеты держит шлюз Nest (apps/api, modules/realtime):
// в основном процессе события уходят в него (useRealtime из runtime.js), в фоновом —
// основному процессу через lib/workerBridge.js, а тот отдаёт их шлюзу.
const { publicJsonReplacer } = require("./lib/publicJson");
const bridge = require("./lib/workerBridge");
const { chatForViewer, hidesMembers } = require("./lib/chatForViewer");

let realtime = null;
function useRealtime(hub) {
  realtime = hub;
}

bridge.on("ws", ({ userIds, payload, chatId }) => realtime?.sendPayload(userIds, payload, chatId));

function broadcastToUsers(userIds, message) {
  if (realtime) return realtime.broadcastToUsers(userIds, message);
  if (!bridge.isWorker) return;
  const chatId = message?.chatId ?? message?.chat?.id;
  // Событие с каналом: админы получают его целиком, подписчики — без списка
  // подписчиков (lib/chatForViewer.js), и у каждого в memberIds только он сам.
  if (message?.chat && message.chat.type === "channel" && Array.isArray(message.chat.memberIds)) {
    const full = JSON.stringify(message, publicJsonReplacer);
    for (const uid of userIds) {
      const payload = hidesMembers(message.chat, uid)
        ? JSON.stringify({ ...message, chat: chatForViewer(message.chat, uid) }, publicJsonReplacer)
        : full;
      bridge.toMain("ws", { userIds: [uid], payload, chatId });
    }
    return;
  }
  bridge.toMain("ws", { userIds: [...userIds], payload: JSON.stringify(message, publicJsonReplacer), chatId });
}

function wsStats() {
  return realtime ? realtime.stats() : { onlineUsers: 0, sockets: 0 };
}

module.exports = { broadcastToUsers, wsStats, useRealtime };
