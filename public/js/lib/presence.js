// Shared between profileDialog.js and contacts.js — both show the exact
// same "в сети" / "был(а) в сети ..." line Telegram's own contact rows and
// profile view use.
//
// Как в Telegram: свежие отметки — словами («только что», «5 минут назад»,
// «сегодня в 14:05», «вчера в 23:10»), старше — датой, прошлогодние — с годом.
// Раньше здесь всегда стояло «был(а) в сети 28.09 в 21:43», даже для человека,
// который вышел минуту назад.
export function statusLabel(user, now = new Date()) {
  if (user.isBot) return "бот";
  if (user.online) return "в сети";
  if (!user.lastSeen) return null; // hidden by their privacy settings, or never set
  const d = new Date(user.lastSeen);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const minutes = Math.floor((now - d) / 60000);
  if (minutes < 1) return "был(а) только что";
  if (minutes < 60) return `был(а) ${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= dayStart) return `был(а) сегодня в ${time}`;
  if (d >= new Date(dayStart.getTime() - 86400000)) return `был(а) вчера в ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
  return `был(а) ${date} в ${time}`;
}

// «1 минуту», «2 минуты», «5 минут».
export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
