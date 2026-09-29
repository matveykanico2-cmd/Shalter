const { HUGO_ID } = require("../data/hugoBot");
const { getChat } = require("../data/chats");
const { sendMessageAndBroadcast } = require("./systemChat");
const { checkText } = require("./languageTool");
const { ADMIN_PHONE, PREMIUM_PLANS } = require("../config");
const { listMessagesPage } = require("../data/messages");
const { getSettings } = require("../data/settings");
const { markTyping, clearTyping } = require("../data/typing");
const { broadcastToUsers } = require("../ws");
const { generateReply, isAiAvailable } = require("./hugoAi");

// What Hugo answers with.
//
// Two jobs, in this order:
//
//   1. Support. A handful of questions make up nearly all of what gets written
//      to a messenger's support account, and every one of them has a fixed,
//      checkable answer that lives in this codebase. Answering them instantly is
//      strictly better than leaving them for whoever next opens the chat.
//   2. Proofreading, which is what Hugo is elsewhere in the app: anything that
//      isn't a recognised question and is long enough to be prose gets checked
//      for spelling and punctuation.
//
// Everything else goes to a free, keyless neural network (lib/hugoAi.js, see the
// section near the bottom) grounded on the TOPICS answers below; these rules are
// what answers when it's unavailable.
//
// When neither fits, it says so and leaves the message for a person, rather than
// guessing. A support bot that invents answers is worse than no support bot: the
// user acts on the wrong instruction and comes back angrier.

// Matched against the lowercased message. Deliberately keyword lists rather than
// anything cleverer — a typo-tolerant matcher that fires on the wrong topic is
// the failure mode to avoid here, and Hugo says "не понял" cheaply.
const TOPICS = [
  {
    id: "stars",
    any: ["звезд", "звёзд", "star", "баланс"],
    answer: () =>
      "⭐ Звёзды — внутренняя валюта: ими покупают подарки, поднимают сообщения и платят за отправку тем, у кого включена платная личка.\n\n" +
      "Купить: Настройки → Звёзды → выберите набор. Оплата — обычным переводом на телефон администрации, после перевода баланс пополнят вручную. " +
      "Платёжного сервиса в приложении нет, всё через перевод.",
  },
  {
    id: "premium",
    any: ["premium", "премиум", "премиум-подписк", "подписк"],
    answer: () =>
      "👑 Shalter Premium — Настройки → Shalter Premium: выберите срок и нажмите «Подписаться».\n\n" +
      // Сроки и цены — из того же PREMIUM_PLANS, по которому считается оплата,
      // чтобы ответ не разошёлся с экраном покупки.
      `Сроки: ${Object.values(PREMIUM_PLANS).map((p) => `${p.label} — ${p.priceRub} ₽`).join(", ")}.\n\n` +
      "Оплата — переводом администрации: переведите указанную сумму и дождитесь подтверждения, Premium выдадут и пришлют уведомление. Автопродления нет.",
  },
  {
    id: "gifts",
    any: ["подарок", "подарк", "подарит", "gift"],
    answer: () =>
      "🎁 Подарки покупаются за звёзды: Настройки → Shalter Premium → «Магазин подарков». Отправка мгновенная.\n\n" +
      "У редких подарков ограниченный тираж — у каждого экземпляра свой номер, и когда тираж кончится, купить его будет нельзя. " +
      "Полученный подарок можно обменять обратно на звёзды по той же цене — он лежит в профиле, во вкладке «Подарки».",
  },
  {
    id: "twofactor",
    any: ["двухфактор", "2fa", "двухэтапн", "код из приложения", "аутентифик", "two-factor", "two factor"],
    answer: () =>
      // Настройки → Конфиденциальность, not a «Безопасность» section: there
      // isn't one, and this answer used to send people looking for it.
      "🔐 Двухфакторная аутентификация — Настройки → Конфиденциальность, раздел «Безопасность» внизу страницы.\n\n" +
      "Отсканируйте QR любым приложением с кодами (Google Authenticator, Aegis, 1Password) и подтвердите шестизначным кодом. " +
      "Обязательно сохраните резервные коды: без них и без телефона вход восстановить нельзя.",
  },
  {
    id: "download",
    any: ["скачат", "андроид", "android", "windows", "виндовс", "линукс", "linux", "приложени", "устано"],
    answer: () => "📥 Все версии — на странице /download: Windows, Linux и Android. Веб-версия работает в браузере без установки.",
  },
  {
    id: "banned",
    any: ["заблокирова", "бан", "разбан", "не могу войти", "не пускает"],
    answer: () =>
      "Если аккаунт заблокирован, причина показывается прямо на экране входа.\n\n" +
      "Считаете блокировку ошибкой — напишите здесь, что произошло: жалобы и причина блокировки хранятся, их посмотрят и снимут блокировку, если она несправедлива.",
  },
  {
    id: "delete",
    any: ["удалить аккаунт", "удалить профиль", "удалиться"],
    answer: () =>
      "Удаление аккаунта — Настройки → Конфиденциальность, в самом низу страницы. Понадобится пароль.\n\n" +
      "Это необратимо: удаляются профиль, сообщения и чаты. Выгрузить свои данные одним файлом можно заранее: Настройки → Данные и память.",
  },
  {
    id: "bots",
    any: ["бот", "bot api", "апи", "api", "токен"],
    answer: () =>
      "🤖 Своего бота можно создать прямо в приложении: Настройки → Боты. Там же встроенный редактор кода — бот отвечает без внешнего сервера.\n\n" +
      "Если хотите держать бота у себя, есть обычный Bot API с токеном и получением обновлений — описание на странице /bots.",
  },
  {
    id: "human",
    any: ["человек", "оператор", "живой", "поддержк"],
    answer: () =>
      "Здесь читает и человек — опишите, что случилось: что делали, что ожидали и что получилось. Если можно, приложите скриншот.\n\n" +
      `Срочный вопрос по оплате — пишите напрямую администрации: ${ADMIN_PHONE}.`,
  },
];

const GREETINGS = ["привет", "здравств", "добрый день", "добрый вечер", "доброе утро", "хай", "ку", "hello", "hi"];
const THANKS = ["спасибо", "спс", "благодар", "thanks"];

// Proofreading has to be asked for, explicitly. The first cut checked anything
// long enough to look like prose, which meant a genuine bug report — "у меня
// экран мигает когда я поворачиваю телефон" — came back as a note about a
// missing capital letter instead of reaching a person. On a support account most
// long messages are problem reports, so silence about grammar is the right
// default and the check is opt-in.
//
// No \b and no \w here: JavaScript defines both over [A-Za-z0-9_], so after a
// Cyrillic word "проверь\b" never matches — the boundary between "ь" and a
// space is, as far as the regex engine is concerned, two non-word characters in
// a row. A negative lookahead for another letter does the same job for Russian.
const CHECK_PREFIX = /^\s*(\/check|проверь(те)?|проверить|проверка|исправь(те)?|ошибки|орфограф[а-яё]*|пунктуац[а-яё]*)(?![а-яёa-z])[\s:,\-—]*/i;

function topicFor(lower) {
  return TOPICS.find((t) => t.any.some((k) => lower.includes(k)));
}

// A compact, readable report: what's wrong, and what to write instead. The
// composer's checker shows this inline with clickable fixes; in a chat it has to
// be plain text, so each mistake is quoted with its replacement.
function proofreadReply(text, matches) {
  if (!matches.length) return "✅ Проверил — ошибок не нашёл.";

  const shown = matches.slice(0, 8);
  const lines = shown.map((m) => {
    const fragment = text.slice(m.offset, m.offset + m.length).trim() || "…";
    const fix = m.replacements[0];
    return fix ? `• «${fragment}» → «${fix}» — ${m.short || m.message}` : `• «${fragment}» — ${m.short || m.message}`;
  });
  const more = matches.length > shown.length ? `\n…и ещё ${matches.length - shown.length}.` : "";
  const word = matches.length === 1 ? "замечание" : matches.length < 5 ? "замечания" : "замечаний";
  return `📝 Нашёл ${matches.length} ${word}:\n\n${lines.join("\n")}${more}`;
}

async function composeReply(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (THANKS.some((k) => lower.startsWith(k))) return "Пожалуйста! Если что-то ещё — пишите.";

  // Asked to proofread, so proofread — before the topic keywords, or "проверь
  // текст про подарки" would be answered with the gift FAQ.
  if (CHECK_PREFIX.test(trimmed)) {
    const subject = trimmed.replace(CHECK_PREFIX, "").trim();
    if (!subject) return "Пришлите текст следующим сообщением, начав со слова «проверь» — например: проверь Превет как дила.";
    const result = await checkText(subject);
    // A proofreading outage is reported plainly: this person did ask for a
    // check, so silence would look like "no mistakes".
    if (result.error) return `Не смог проверить: ${result.error}`;
    return proofreadReply(subject, result.matches);
  }

  const topic = topicFor(lower);
  if (topic) return topic.answer();

  if (GREETINGS.some((k) => lower.startsWith(k))) {
    return (
      "Здравствуйте! Я Hugo — поддержка Shalter.\n\n" +
      "Спросите про звёзды, Premium, подарки, двухфакторную аутентификацию, ботов или где скачать приложение — отвечу сразу. " +
      "Опишете проблему — её прочитает человек.\n\n" +
      "И ещё я проверяю тексты: напишите «проверь» и следом фразу."
    );
  }

  return (
    "Принял — сообщение сохранено, его прочитает человек из поддержки.\n\n" +
    "Если вопрос из частых, отвечу прямо сейчас: напишите «звёзды», «Premium», «подарки», «двухфакторная», «боты» или «скачать». " +
    "А если нужно проверить текст — начните сообщение со слова «проверь»."
  );
}

// ── Нейросеть (lib/hugoAi.js) ────────────────────────────────────────────────
//
// Всё, что не команда «проверь» и не /команда, отвечает нейросеть — с
// историей чата и с ответами из TOPICS выше как проверенным знанием, чтобы она
// не выдумывала пути в настройках. Нейросеть недоступна, не уложилась в
// таймаут или человек пишет слишком часто — отвечают правила composeReply,
// как раньше.

const HISTORY_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8; // запросов к нейросети в минуту на человека
const TYPING_REFRESH_MS = 3000; // «печатает» живёт 4 с (data/typing.js)

const KNOWLEDGE = TOPICS.map((t) => `[${t.id}] ${t.answer()}`).join("\n\n");

const aiCallsByUser = new Map(); // userId → [timestamp, …] за последнюю минуту
const busyChats = new Map(); // chatId → { rerun } — пока идёт генерация

function takeRateSlot(userId) {
  const now = Date.now();
  const recent = (aiCallsByUser.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    aiCallsByUser.set(userId, recent);
    return false;
  }
  recent.push(now);
  aiCallsByUser.set(userId, recent);
  return true;
}

// Команды остаются за правилами: проверка текста и /start, /help и прочие.
function isCommand(text) {
  return CHECK_PREFIX.test(text) || /^\s*\//.test(text);
}

async function loadHistory(chat, userId) {
  const settings = await getSettings(userId).catch(() => null);
  const clearedBefore = settings?.chatClears?.[chat.id] ?? null;
  const { messages } = listMessagesPage(chat.id, userId, clearedBefore, { limit: HISTORY_LIMIT });
  const turns = messages
    .filter((m) => !m.deleted)
    .map((m) => ({
      role: m.senderId === HUGO_ID ? "assistant" : "user",
      content: m.type === "text" && m.text?.trim() ? m.text.trim() : "[вложение без текста]",
    }));
  // Разговор начинается с реплики пользователя — приветствие Hugo сверху
  // модели не нужно, а некоторые API не любят assistant первым.
  while (turns.length && turns[0].role === "assistant") turns.shift();
  return turns;
}

// «Hugo печатает…» на всё время генерации: статус живёт 4 секунды, поэтому
// обновляется, пока не придёт ответ.
function startTyping(chat, userId) {
  const ping = () => {
    markTyping(chat.id, HUGO_ID, "typing");
    broadcastToUsers([userId], { type: "typing:update", chatId: chat.id, userId: HUGO_ID, action: "typing" });
  };
  ping();
  const timer = setInterval(ping, TYPING_REFRESH_MS);
  return () => {
    clearInterval(timer);
    clearTyping(chat.id, HUGO_ID);
    broadcastToUsers([userId], { type: "typing:update", chatId: chat.id, userId: HUGO_ID, action: "cancel" });
  };
}

// Ответ нейросети, а если её нет — правилами на последнее сообщение человека.
async function aiReply(chat, userId, fallbackText) {
  const stopTyping = startTyping(chat, userId);
  try {
    const history = await loadHistory(chat, userId);
    const lastUser = [...history].reverse().find((t) => t.role === "user")?.content ?? fallbackText;
    const result = takeRateSlot(userId) ? await generateReply(history, { knowledge: KNOWLEDGE }) : null;
    return result?.text ?? (await composeReply(lastUser));
  } finally {
    stopTyping();
  }
}

// Called fire-and-forget from routes/messages.js after a message lands. Never
// throws: a failure here must not affect the send it was triggered by.
async function dispatchHugo(chatId, message) {
  try {
    if (message.senderId === HUGO_ID) return;
    if (message.type !== "text" || !message.text?.trim()) return;
    const chat = await getChat(chatId);
    if (!chat?.memberIds.includes(HUGO_ID)) return;
    // Only in the one-to-one support chat. In a group Hugo would answer every
    // message that happened to contain the word "бот".
    if (chat.type !== "dm") return;

    const userId = message.senderId;
    if (!isAiAvailable() || isCommand(message.text)) {
      const reply = await composeReply(message.text);
      if (reply) await sendMessageAndBroadcast(chat, HUGO_ID, reply);
      return;
    }

    // Несколько сообщений подряд, пока Hugo думает, — один ответ на все:
    // после текущей генерации ещё одна, уже с новыми сообщениями в истории.
    const busy = busyChats.get(chatId);
    if (busy) {
      busy.rerun = true;
      return;
    }
    const state = { rerun: false };
    busyChats.set(chatId, state);
    try {
      do {
        state.rerun = false;
        const reply = await aiReply(chat, userId, message.text);
        if (reply) await sendMessageAndBroadcast(chat, HUGO_ID, reply);
      } while (state.rerun);
    } finally {
      busyChats.delete(chatId);
    }
  } catch (err) {
    console.error("hugo bot reply failed:", err);
  }
}

module.exports = { dispatchHugo, composeReply, HUGO_ID };
