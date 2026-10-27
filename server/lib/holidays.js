// Только праздники с постоянной датой: обход (holidaySweep.js) поздравляет с ними
// всех, кто не выключил их в настройках. Переходящие (Пасха, профессиональные дни
// «в третье воскресенье») сюда не годятся.
const BUILTIN_HOLIDAYS = [
  { id: "shalter_day", title: "День основания Shalter", date: "09-25" },
  { id: "new_year", title: "Новый год", date: "01-01" },
  { id: "orthodox_christmas", title: "Рождество", date: "01-07" },
  { id: "defender_day", title: "День защитника Отечества", date: "02-23" },
  { id: "international_women_day", title: "Международный женский день", date: "03-08" },
  { id: "astronaut_day", title: "День космонавтики", date: "04-12" },
  { id: "labor_day", title: "Праздник весны и труда", date: "05-01" },
  { id: "victory_day", title: "День Победы", date: "05-09" },
  { id: "russia_day", title: "День России", date: "06-12" },
  { id: "knowledge_day", title: "День знаний", date: "09-01" },
  { id: "teacher_day", title: "День учителя", date: "10-05" },
  { id: "unity_day", title: "День народного единства", date: "11-04" },
];

module.exports = { BUILTIN_HOLIDAYS };
