// Плашку закрыли крестиком — помним для этого чата (shalter_contact_bar_hidden_<id>).
const key = (chatId: string) => `shalter_contact_bar_hidden_${chatId}`;

export function isDismissed(chatId: string) {
  try {
    return localStorage.getItem(key(chatId)) === "1";
  } catch {
    return false;
  }
}

export function dismiss(chatId: string) {
  try {
    localStorage.setItem(key(chatId), "1");
  } catch {
    // Без хранилища плашка просто вернётся в следующий раз.
  }
}
