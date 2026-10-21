const { EventEmitter } = require("events");

// «Доступ пользователя отозван»: завершён сеанс, сменён пароль, удалён аккаунт, бан.
// Слой данных сообщает о каждом таком изменении сам, а открытые сокеты (ws.js)
// закрываются по событию — без периодического перебора всех подключений.
const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(0);
const bridge = require("./workerBridge");
bridge.on("revoked", ({ userId }) => emitAccessRevoked(userId));

function emitAccessRevoked(userId) {
  if (!userId) return;
  // Отзыв в фоновом процессе (удаление аккаунта по сроку) — сокеты закрывает основной.
  if (bridge.isWorker) return bridge.toMain("revoked", { userId });
  sessionEvents.emit("revoked", userId);
}

function onAccessRevoked(fn) {
  sessionEvents.on("revoked", fn);
  return () => sessionEvents.off("revoked", fn);
}

module.exports = { emitAccessRevoked, onAccessRevoked };
