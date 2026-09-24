import { getState } from "../state.js";

// Модератор сервера — полный админ (isDeveloper) или тот, кому выдали раздел
// «Модерация» (server/lib/adminAccess.js). Он может удалять чужие сообщения,
// файлы и ссылки, истории, группы и каналы. Здесь это только про то, какие
// кнопки показать: права всё равно проверяет сервер на каждом запросе.
export function isServerModerator() {
  const me = getState().user;
  return !!me && (!!me.isDeveloper || (me.adminSections ?? []).includes("moderation"));
}
