import { api } from "../api.js";

// Карточки людей, которых нет в списке участников чата.
//
// Отправитель сообщения берётся из members, который приходит с чатом
// (GET /api/chats/:id). Но в этом списке только те, кто состоит в чате прямо
// сейчас: вышедший из группы, удалённый участник, новичок, вступивший уже после
// открытия чата (его сообщение приезжает по WebSocket, а members остаётся
// старым), — у всех их сообщений не было ни аватара, ни имени. Отсюда и
// «аватарки иногда не показываются». Недостающих догружаем по одному через
// профиль (/api/users/:id — он же соблюдает настройку «Фото профиля»).

const known = new Map(); // id -> пользователь (или заглушка удалённого аккаунта)
const inFlight = new Map(); // id -> Promise, чтобы не спрашивать одного дважды

// Уже известная карточка или undefined — синхронно, для отрисовки.
export function cachedUser(id) {
  return known.get(id);
}

// Догружает тех, кого ещё нет в кэше. Возвращает true, если появился хоть
// кто-то новый (значит, стоит перерисовать).
export async function fetchUsers(ids) {
  // c_… — это чат/канал (например, автор истории канала), профиля у него нет.
  const wanted = [...new Set(ids)].filter((id) => typeof id === "string" && id && !id.startsWith("c_") && !known.has(id));
  if (!wanted.length) return false;
  const results = await Promise.all(
    wanted.map((id) => {
      if (!inFlight.has(id)) {
        const p = api
          .getUser(id)
          .then((res) => {
            if (res?.user) known.set(id, res.user);
            return !!res?.user;
          })
          .catch((err) => {
            // Аккаунта больше нет — запоминаем заглушку, чтобы не спрашивать
            // снова на каждой перерисовке. Сетевая ошибка — не запоминаем:
            // в следующий раз попробуем ещё.
            if (err?.message === "not found") {
              known.set(id, { id, name: "Удалённый аккаунт", deleted: true });
              return true;
            }
            return false;
          })
          .finally(() => inFlight.delete(id));
        inFlight.set(id, p);
      }
      return inFlight.get(id);
    })
  );
  return results.some(Boolean);
}

// Свежие данные о человеке (например, из contact:updated) — обновляем кэш,
// если он там уже был.
export function rememberUser(user) {
  if (user?.id && known.has(user.id)) known.set(user.id, { ...known.get(user.id), ...user });
}
