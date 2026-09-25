// Built-in holiday calendar for the Settings → Holidays screen and
// lib/holidaySweep.js. `date` is "MM-DD" — year-agnostic, checked against
// today's month+day the same way users.js's birthday column is.
//
// A person can turn any of these off (settings.holidays.disabled, by id) or
// add their own (settings.holidays.custom) — see server/data/settings.js's
// DEFAULT_SETTINGS.
const BUILTIN_HOLIDAYS = [
  { id: "shalter_day", title: "День основания Shalter", date: "09-25" },
];

module.exports = { BUILTIN_HOLIDAYS };
