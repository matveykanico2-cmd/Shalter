export function statusLabel(user, now = new Date()) {
  if (user.isBot) return "бот";
  if (user.online) return "в сети";
  if (!user.lastSeen) return null;
  const ago = timeAgo(user.lastSeen, now);
  return ago ? `был(а) ${ago}` : null;
}

export function timeAgo(iso, now = new Date()) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const minutes = Math.floor((now - d) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return minutes === 1 ? "минуту назад" : `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "час назад" : `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= new Date(dayStart.getTime() - 86400000)) return `вчера в ${time}`;
  const days = Math.floor((dayStart - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days < 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
  return `${date} в ${time}`;
}

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
