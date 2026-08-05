// Shared between profileDialog.js and contacts.js — both show the exact
// same "в сети" / "был(а) в сети ..." line Telegram's own contact rows and
// profile view use.
export function statusLabel(user) {
  if (user.online) return "в сети";
  if (!user.lastSeen) return null; // hidden by their privacy settings, or never set
  const d = new Date(user.lastSeen);
  return `был(а) в сети ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}
