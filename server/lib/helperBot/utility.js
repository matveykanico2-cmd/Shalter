const QRCode = require("qrcode");
const { createShortLink } = require("../../data/shortLinks");
const { addReminder } = require("../../data/reminders");
const { addNote, listNotes, deleteNoteByIndex } = require("../../data/notes");
const { parseDuration } = require("./shared");
const { HELPER_BOT_ID } = require("../../data/helperBot");

const WEATHER_CODES = {
  0: "☀️ ясно", 1: "🌤 в основном ясно", 2: "⛅ переменная облачность", 3: "☁️ пасмурно",
  45: "🌫 туман", 48: "🌫 изморозь", 51: "🌦 морось", 61: "🌧 дождь", 63: "🌧 сильный дождь",
  71: "🌨 снег", 73: "🌨 сильный снег", 80: "🌦 ливень", 95: "⛈ гроза",
};

function safeCalc(expr) {
  const clean = String(expr ?? "").replace(/\s+/g, "");
  if (!clean) return null;
  if (!/^[0-9+\-*/().]+$/.test(clean)) return null;

  let pos = 0;
  function peek() {
    return clean[pos];
  }
  function parseNumber() {
    const start = pos;
    while (pos < clean.length && /[0-9.]/.test(clean[pos])) pos++;
    if (pos === start) throw new Error("bad number");
    return Number(clean.slice(start, pos));
  }
  function parseFactor() {
    if (peek() === "(") {
      pos++;
      const value = parseExpr();
      if (peek() !== ")") throw new Error("missing )");
      pos++;
      return value;
    }
    if (peek() === "-") {
      pos++;
      return -parseFactor();
    }
    return parseNumber();
  }
  function parseTerm() {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = clean[pos++];
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseExpr() {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = clean[pos++];
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  try {
    const result = parseExpr();
    if (pos !== clean.length || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

const commands = {
  async calc(ctx) {
    const result = safeCalc(ctx.args);
    if (result === null) return "Не понял выражение. Пример: /calc 2+2*3";
    return `🧮 ${ctx.args} = ${result}`;
  },

  async qr(ctx) {
    if (!ctx.args) return "Использование: /qr текст или ссылка";
    const dataUrl = await QRCode.toDataURL(ctx.args, { margin: 1, width: 300 });
    return { text: "📷 QR-код готов:", attachments: [{ kind: "image", url: dataUrl }] };
  },

  async short(ctx) {
    const url = ctx.argv[0];
    if (!url || !/^https?:\/\//i.test(url)) return "Использование: /short https://example.com";
    const code = createShortLink(url, ctx.senderId);
    return `🔗 Короткая ссылка: /s/${code}\n(откройте на этом же сервере Shalter)`;
  },

  async timer(ctx) {
    const ms = parseDuration(ctx.argv[0]);
    if (!ms) return "Использование: /timer 30s (или 5m, 1h)";
    const { sendMessageAndBroadcast } = require("../systemChat");
    setTimeout(() => {
      sendMessageAndBroadcast(ctx.chat, HELPER_BOT_ID, `⏰ Время вышло! (таймер на ${ctx.argv[0]})`).catch((err) =>
        console.error("timer delivery failed:", err)
      );
    }, ms);
    return `⏱ Таймер поставлен на ${ctx.argv[0]}.`;
  },

  async remind(ctx) {
    const ms = parseDuration(ctx.argv[0]);
    const text = ctx.argv.slice(1).join(" ").trim();
    if (!ms || !text) return "Использование: /remind 10m текст напоминания";
    addReminder({
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: ctx.senderId,
      chatId: ctx.chatId,
      text,
      dueAt: new Date(Date.now() + ms).toISOString(),
      createdAt: new Date().toISOString(),
    });
    return `📝 Напомню через ${ctx.argv[0]}: ${text}`;
  },

  async note(ctx) {
    const [sub, ...rest] = ctx.argv;
    if (sub === "add") {
      const text = rest.join(" ").trim();
      if (!text) return "Использование: /note add текст заметки";
      addNote(ctx.senderId, text);
      return "✅ Заметка сохранена.";
    }
    if (sub === "del") {
      const index = Number(rest[0]);
      if (!Number.isFinite(index)) return "Использование: /note del номер (см. /note list)";
      return deleteNoteByIndex(ctx.senderId, index) ? "🗑 Заметка удалена." : "Заметки с таким номером нет.";
    }
    const notes = listNotes(ctx.senderId);
    if (!notes.length) return "Заметок пока нет. Добавить: /note add текст";
    return `📒 Ваши заметки:\n\n${notes.map((n, i) => `${i + 1}. ${n.text}`).join("\n")}`;
  },

  async weather(ctx) {
    const city = ctx.args.trim();
    if (!city) return "Использование: /weather Москва";
    try {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=${encodeURIComponent(city)}`
      ).then((r) => r.json());
      const place = geo?.results?.[0];
      if (!place) return `Не нашёл город «${city}».`;
      const weather = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true`
      ).then((r) => r.json());
      const cw = weather?.current_weather;
      if (!cw) return "Не удалось получить погоду, попробуйте позже.";
      const label = WEATHER_CODES[cw.weathercode] ?? "погода";
      return `${label}\n📍 ${place.name}\n🌡 ${cw.temperature}°C, ветер ${cw.windspeed} км/ч`;
    } catch {
      return "Не удалось получить погоду, попробуйте позже.";
    }
  },

  async translate(ctx) {
    const maybeLang = ctx.argv[0];
    const hasLangPrefix = /^[a-z]{2}$/i.test(maybeLang ?? "");
    const targetLang = hasLangPrefix ? maybeLang.toLowerCase() : "en";
    const text = hasLangPrefix ? ctx.argv.slice(1).join(" ") : ctx.args;
    if (!text) return "Использование: /translate en текст (по умолчанию — на английский)";
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`
      ).then((r) => r.json());
      const translated = res?.responseData?.translatedText;
      if (!translated) return "Не удалось перевести, попробуйте позже.";
      return `🌐 ${translated}`;
    } catch {
      return "Не удалось перевести, попробуйте позже.";
    }
  },
};

module.exports = { commands };
