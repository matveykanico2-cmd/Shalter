import { useState } from "react";

// Тот же ключ, что у старого клиента: фильтр переживает переход на новый.
const UNREAD_ONLY_KEY = "shalter.chatList.unreadOnly";

function read() {
  try {
    return localStorage.getItem(UNREAD_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

/** «Только непрочитанные» — запоминается на устройстве. */
export function useUnreadOnly() {
  const [on, setOn] = useState(read);
  const toggle = () =>
    setOn((prev) => {
      try {
        localStorage.setItem(UNREAD_ONLY_KEY, prev ? "0" : "1");
      } catch {
        // хранилище недоступно — фильтр живёт до перезагрузки
      }
      return !prev;
    });
  return [on, toggle] as const;
}
