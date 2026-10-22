/** Текст ошибки для человека: у API он свой, у обрыва сети — общий. */
export function errorText(err: unknown, fallback = "Что-то пошло не так"): string {
  if (err instanceof TypeError) return "Нет связи с сервером";
  return err instanceof Error && err.message ? err.message : fallback;
}
