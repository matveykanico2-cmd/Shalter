/** Безопасный CSS-фон аватара: цвет, прозрачность или простой градиент из цветов. */
const HEX = "#[0-9a-fA-F]{3,8}";
const COLOR_RE = new RegExp(`^(?:${HEX}|transparent|linear-gradient\\(\\d{1,3}deg,\\s*${HEX},\\s*${HEX}\\))$`);

export function validAvatarColor(value: unknown): value is string {
  return typeof value === "string" && value.length <= 96 && COLOR_RE.test(value);
}
