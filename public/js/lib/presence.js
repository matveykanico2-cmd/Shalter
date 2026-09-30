// Shared between profileDialog.js and contacts.js — both show the exact
// same "в сети" / "был(а) в сети ..." line Telegram's own contact rows and
// profile view use.
//
// Свежие отметки — словами («только что», «5 минут назад», «2 часа назад»,
// «вчера в 23:10»), старше недели — датой, прошлогодние — с годом.
// Раньше здесь всегда стояло «был(а) в сети 28.09 в 21:43», даже для человека,
// который вышел минуту назад.
export function statusLabel(user, now = new Date()) {
  if (user.isBot) return "бот";
  if (user.online) return "в сети";
  if (!user.lastSeen) return null; // hidden by their privacy settings, or never set
  const ago = timeAgo(user.lastSeen, now);
  return ago ? `был(а) ${ago}` : null;
}

// Относительное время для любых отметок в прошлом — «только что», «3 минуты
// назад», «час назад», «5 часов назад», «вчера в 23:10», «12 мая в 14:05».
// Одна функция на весь клиент: шапка чата, контакты, звонки, устройства —
// раньше каждый экран печатал дату по-своему, и где-то стояло «28.09 в 21:43»
// у человека, вышедшего минуту назад.
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

// «1 минуту», «2 минуты», «5 минут».
export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
