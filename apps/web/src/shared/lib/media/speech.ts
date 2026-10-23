// Расшифровка голосовых во время записи — встроенное в браузер распознавание речи, как
// public/js/lib/speech.js. В Chrome оно идёт через облако Google, поэтому только по
// настройке «Расшифровка голосовых».
type SpeechResultList = { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const MAX_TRANSCRIPT = 4000;

const Recognition = (globalThis as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
  ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;

export function startTranscription(lang?: string) {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = lang || navigator.language || "ru-RU";
  rec.continuous = true;
  rec.interimResults = false;
  const parts: string[] = [];
  let stopped = false;
  let finished: () => void = () => {};
  const done = new Promise<void>((resolve) => (finished = resolve));
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i]!.isFinal) parts.push(e.results[i]![0].transcript.trim());
  };
  // Распознавание само обрывается на паузах — перезапускаем, пока идёт запись.
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
        return;
      } catch {
        // не перезапустилось — заканчиваем
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
    return joined ? (joined[0]!.toUpperCase() + joined.slice(1)).slice(0, MAX_TRANSCRIPT) : "";
  };
  return {
    /** Ждём последние результаты (не дольше 1,5 с) и отдаём текст. */
    async stop() {
      stopped = true;
      try {
        rec.stop();
      } catch {
        // уже остановлено
      }
      await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
      return text();
    },
    cancel() {
      stopped = true;
      try {
        rec.abort();
      } catch {
        // уже остановлено
      }
    },
  };
}
