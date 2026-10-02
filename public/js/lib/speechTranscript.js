const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function isTranscriptSupported() {
  return !!Recognition;
}

export function startTranscript(lang = navigator.language || "ru-RU") {
  if (!Recognition) return { stop: async () => "", cancel() {} };
  const parts = [];
  let interim = "";
  let active = true;
  let finished = null;
  let rec = null;

  function launch() {
    try {
      rec = new Recognition();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) parts.push(r[0].transcript.trim());
          else interim += r[0].transcript;
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") active = false;
      };
      rec.onend = () => {
        if (active) launch();
        else finished?.();
      };
      rec.start();
    } catch {
      active = false;
      finished?.();
    }
  }
  launch();

  const text = () => [...parts, interim.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return {
    stop() {
      return new Promise((resolve) => {
        const done = () => resolve(text());
        if (!active || !rec) return done();
        active = false;
        finished = done;
        setTimeout(done, 1500);
        try {
          rec.stop();
        } catch {
          done();
        }
      });
    },
    cancel() {
      active = false;
      try {
        rec?.abort();
      } catch {}
    },
  };
}
