const { setPending, getPending, clearPending } = require("./pendingState");

const JOKES = [
  "Программист заходит в бар. Заказывает пиво. Заказывает 0 пива. Заказывает 999999999 пива. Заказывает ящерицу. Заказывает NULL пива. Бар взрывается.",
  "— Почему программисты путают Хэллоуин и Рождество?\n— Потому что OCT 31 == DEC 25.",
  "Есть 10 типов людей: те, кто понимает двоичную систему, и те, кто нет.",
  "Отладка — это как быть детективом в фильме, где ты же и убийца.",
  "Мой код работает. Я не знаю почему. Мой код не работает. Я не знаю почему.",
  "— Сколько программистов нужно, чтобы вкрутить лампочку?\n— Ни одного, это аппаратная проблема.",
];

const QUIZZES = [
  { q: "Сколько байт в килобайте (по стандарту IEC)?", options: ["1000", "1024", "1042", "1204"], correct: 1 },
  { q: "Какой язык используется для стилизации веб-страниц?", options: ["HTML", "CSS", "SQL", "JSON"], correct: 1 },
  { q: "Как называется столица Франции?", options: ["Берлин", "Мадрид", "Париж", "Рим"], correct: 2 },
  { q: "Сколько будет 7 × 8?", options: ["54", "56", "58", "64"], correct: 1 },
];

const BALL_ANSWERS = [
  "Да", "Нет", "Определённо да", "Даже не думай", "Спроси позже", "Сложно сказать",
  "Скорее всего да", "Скорее всего нет", "Без сомнений", "Мой ответ — нет",
];

const MEMES = [
  "когда наконец пофиксил баг, который сам же и создал",
  "я и код в 3 часа ночи: полная гармония",
  "«работает на моей машине» — известные последние слова",
  "когда тесты зелёные, но ты никому не веришь",
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const commands = {
  async mem() {
    return `🖼 ${MEMES[randomInt(0, MEMES.length - 1)]}`;
  },

  async joke() {
    return `😄 ${JOKES[randomInt(0, JOKES.length - 1)]}`;
  },

  async quiz() {
    const q = QUIZZES[randomInt(0, QUIZZES.length - 1)];
    return {
      text: `❓ ${q.q}`,
      attachments: [
        {
          kind: "poll",
          meta: { options: q.options, voterIds: q.options.map(() => []), correctIndex: q.correct },
        },
      ],
    };
  },

  async poll(ctx) {
    // /poll Вопрос?|Вариант 1|Вариант 2|...
    const parts = ctx.args.split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return "Использование: /poll Вопрос?|Вариант 1|Вариант 2";
    const [question, ...options] = parts;
    return {
      text: `📊 ${question}`,
      attachments: [
        {
          kind: "poll",
          meta: { options, voterIds: options.map(() => []), correctIndex: null },
        },
      ],
    };
  },

  async roll() {
    return `🎲 Выпало: ${randomInt(1, 6)}`;
  },

  async flip() {
    return `🪙 ${Math.random() < 0.5 ? "Орёл" : "Решка"}`;
  },

  async random(ctx) {
    const min = Number(ctx.argv[0]);
    const max = Number(ctx.argv[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      return "Использование: /random 1 100";
    }
    return `🔢 ${randomInt(min, max)}`;
  },

  async ball() {
    return `🎱 ${BALL_ANSWERS[randomInt(0, BALL_ANSWERS.length - 1)]}`;
  },

  async game(ctx) {
    const existing = getPending(ctx.chatId, ctx.senderId);
    if (existing?.type === "guess") {
      const guess = Number(ctx.args);
      if (!Number.isFinite(guess)) return "Назовите число от 1 до 100 (или /cancel, чтобы выйти).";
      if (guess === existing.answer) {
        clearPending(ctx.chatId, ctx.senderId);
        return `🎉 Угадали! Это было ${existing.answer}, попыток: ${existing.tries + 1}.`;
      }
      existing.tries += 1;
      setPending(ctx.chatId, ctx.senderId, existing);
      return guess < existing.answer ? "⬆️ Больше" : "⬇️ Меньше";
    }
    const answer = randomInt(1, 100);
    setPending(ctx.chatId, ctx.senderId, { type: "guess", answer, tries: 0 });
    return "🎮 Угадай число от 1 до 100! Напишите число в чат (или /cancel).";
  },
};

module.exports = { commands };
