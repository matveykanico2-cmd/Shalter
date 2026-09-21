// Built-in holiday calendar for the Settings → Holidays screen and
// lib/holidaySweep.js. `date` is "MM-DD" — year-agnostic, checked against
// today's month+day the same way users.js's birthday column is.
//
// A person can turn any of these off (settings.holidays.disabled, by id) or
// add their own (settings.holidays.custom) — see server/data/settings.js's
// DEFAULT_SETTINGS.
const BUILTIN_HOLIDAYS = [
  { id: "new_year", title: "Новый год", date: "01-01" },
  { id: "christmas", title: "Рождество", date: "01-07" },
  { id: "defender_day", title: "День защитника Отечества", date: "02-23" },
  { id: "womens_day", title: "Международный женский день", date: "03-08" },
  { id: "victory_day", title: "День Победы", date: "05-09" },
  { id: "knowledge_day", title: "День знаний", date: "09-01" },
];

module.exports = { BUILTIN_HOLIDAYS };
