// Display list for /help and /menu — kept separate from the actual handler
// maps (info.js, moderation.js, ...) so the two can't drift into listing
// different commands than the ones that actually respond.
const CATEGORIES = [
  {
    title: "Основное",
    commands: [
      ["start", "запуск бота"],
      ["help", "список команд"],
      ["menu", "главное меню"],
      ["settings", "настройки"],
      ["profile", "мой профиль"],
      ["lang", "сменить язык"],
      ["id", "узнать свой ID"],
      ["ping", "проверка связи"],
      ["info", "информация о пользователе"],
      ["about", "о боте"],
      ["support", "поддержка"],
      ["feedback", "отзыв"],
      ["cancel", "отменить действие"],
      ["clear", "очистить историю чата у себя"],
    ],
  },
  {
    title: "Развлечения",
    commands: [
      ["mem", "случайный мем"],
      ["game", "мини-игра"],
      ["joke", "анекдот"],
      ["quiz", "викторина"],
      ["roll", "бросить кубик"],
      ["flip", "орёл или решка"],
      ["random", "случайное число"],
      ["ball", "магический шар"],
      ["poll", "создать опрос"],
    ],
  },
  {
    title: "Утилиты",
    commands: [
      ["weather", "погода"],
      ["translate", "перевод текста"],
      ["calc", "калькулятор"],
      ["qr", "сгенерировать QR-код"],
      ["short", "сократить ссылку"],
      ["timer", "таймер"],
      ["remind", "напоминание"],
      ["note", "заметки"],
    ],
  },
  {
    title: "Модерация группы",
    commands: [
      ["rules", "правила чата"],
      ["top", "топ активных"],
      ["stats", "статистика чата"],
      ["report", "жалоба админам"],
      ["ban", "забанить"],
      ["mute", "замутить"],
      ["unmute", "размутить"],
      ["warn", "предупреждение"],
      ["unwarn", "снять предупреждение"],
      ["kick", "исключить"],
      ["pin", "закрепить сообщение"],
      ["unpin", "открепить"],
      ["admin", "меню управления группой"],
    ],
  },
  {
    title: "Звёзды и рефералы",
    commands: [
      ["balance", "баланс баллов"],
      ["daily", "ежедневный бонус"],
      ["invite", "пригласить друга"],
      ["ref", "реферальная ссылка"],
      ["shop", "магазин"],
      ["donate", "поддержать проект"],
    ],
  },
];

function helpText() {
  return CATEGORIES.map(
    (cat) => `${cat.title}:\n` + cat.commands.map(([cmd, desc]) => `/${cmd} — ${desc}`).join("\n")
  ).join("\n\n");
}

module.exports = { CATEGORIES, helpText };
