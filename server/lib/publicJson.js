// Общий replacer для всего, что сервер отдаёт наружу (HTTP-ответы и WS-события).
// deletedForIds — служебный список «кто скрыл сообщение у себя»: по нему сервер
// прячет сообщение от этих людей, а остальным он не нужен и раскрывал бы, кто
// именно удалил переписку у себя. Получатель сообщения в этом списке никогда не
// состоит, поэтому для него честное значение — пустой список.
function publicJsonReplacer(key, value) {
  if (key === "deletedForIds" && Array.isArray(value)) return [];
  return value;
}

module.exports = { publicJsonReplacer };
