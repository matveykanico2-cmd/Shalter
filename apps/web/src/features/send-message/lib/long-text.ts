// Длина сообщения: один лимит с сервером (MAX_MESSAGE_TEXT в apps/api,
// modules/messages/lib/message-content.ts). Длиннее — не отправляем и показываем, на сколько
// сократить: текст не режется и не делится на несколько сообщений.
export const MAX_TEXT = 20_000;
/** С какой длины показывать счётчик у поля ввода. */
export const COUNTER_FROM = MAX_TEXT - 1_000;

/** На сколько символов текст длиннее лимита (0 — помещается). */
export const overLimit = (text: string, max = MAX_TEXT) => Math.max(0, text.length - max);

export const overLimitText = (over: number, max = MAX_TEXT) => `Сообщение длиннее ${max.toLocaleString("ru-RU")} символов — сократите на ${over.toLocaleString("ru-RU")}`;

/**
 * Текст к отправке: пустые строки в начале и пробелы в конце убираем, а отступ первой строки,
 * переносы и пробелы внутри — как набрали (код, стихи, списки).
 */
export const outgoingText = (typed: string) => typed.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/\s+$/, "");
