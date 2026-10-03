// Расшифровка голосовых во время записи — через встроенное в браузер
// распознавание речи (Web Speech API). Текст уходит вместе с голосовым,
// поэтому собеседнику расшифровка доступна сразу и без сервера распознавания.
//
// В Chrome распознавание идёт через облако Google, поэтому функция включается
// только явно — переключателем «Расшифровка голосовых» в настройках.

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function isSpeechSupported() {
  return !!Recognition;
}

export const MAX_TRANSCRIPT = 4000;

export function startTranscription(lang) {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = lang || navigator.language || "ru-RU";
  rec.continuous = true;
  rec.interimResults = false;
  const parts = [];
  let stopped = false;
  let finished;
  const done = new Promise((resolve) => (finished = resolve));

  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) parts.push(e.results[i][0].transcript.trim());
    }
  };
  // Распознавание само обрывается на паузах — перезапускаем, пока идёт запись.
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
        return;
      } catch {
      }
    }
    finished();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") stopped = true;
  };
  try {
    rec.start();
  } catch {
    return null;
  }

  const text = () => {
    const joined = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return joined ? (joined[0].toUpperCase() + joined.slice(1)).slice(0, MAX_TRANSCRIPT) : "";
  };

  return {
    // Ждём последние результаты (не дольше 1.5 с) и отдаём текст.
    async stop() {
      stopped = true;
      try {
        rec.stop();
      } catch {
      }
      await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
      return text();
    },
    cancel() {
      stopped = true;
      try {
        rec.abort();
      } catch {
      }
    },
  };
}
