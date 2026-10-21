// Список подписчиков канала видят только его владельцы и админы — как в Telegram.
// Обычному подписчику вместо memberIds (у больших каналов это десятки тысяч id,
// мегабайты в каждом списке чатов) уходит только он сам; число подписчиков —
// в membersCount, которое есть у любого чата.
//
// Применяется ко всему, что уходит наружу: к HTTP-ответам (shapeBodyForViewer,
// подключён в server/index.js) и к WS-событиям с чатом (server/ws.js).
function isChannelStaff(chat, uid) {
  return chat.ownerId === uid || (chat.ownerIds ?? []).includes(uid) || (chat.adminIds ?? []).includes(uid);
}

function hidesMembers(chat, uid) {
  return chat?.type === "channel" && Array.isArray(chat.memberIds) && !isChannelStaff(chat, uid);
}

function chatForViewer(chat, uid) {
  if (!hidesMembers(chat, uid)) return chat;
  return {
    ...chat,
    memberIds: chat.memberIds.includes(uid) ? [uid] : [],
    membersCount: chat.membersCount ?? chat.memberIds.length,
  };
}

const isChatLike = (v) => v && typeof v === "object" && typeof v.id === "string" && typeof v.type === "string" && Array.isArray(v.memberIds);

// Ответ { chat } / { chats: [...] } (и другие верхнеуровневые поля-чаты) — с
// урезанными каналами. Остальное не трогаем.
function shapeBodyForViewer(body, uid) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  let out = body;
  for (const [key, value] of Object.entries(body)) {
    let next = value;
    if (isChatLike(value)) next = chatForViewer(value, uid);
    else if (Array.isArray(value) && value.some(isChatLike)) next = value.map((v) => (isChatLike(v) ? chatForViewer(v, uid) : v));
    if (next !== value) {
      if (out === body) out = { ...body };
      out[key] = next;
    }
  }
  return out;
}

module.exports = { chatForViewer, hidesMembers, shapeBodyForViewer };
