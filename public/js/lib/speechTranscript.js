const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function isTranscriptSupported() {
  return !!Recognition;
}

// Prefer Russian if the user lists it at all: navigator.language alone is often
// "en-US" on a Russian speaker's machine, which makes recognition return nothing
// for Russian speech. Otherwise honor a non-English primary language (uk, de, ...),
// and fall back to Russian (the UI language) for English-only browsers.
function pickLang() {
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean);
  return langs.find((l) => /^ru\b/i.test(l)) || (langs[0] && !/^en\b/i.test(langs[0]) ? langs[0] : "ru-RU");
}

// Errors after which restarting can't help (no permission, no mic, no speech
// service reachable — e.g. Electron/Chromium builds without Google's API key).
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported", "bad-grammar"]);

export function startTranscript(lang = pickLang()) {
  if (!Recognition) return { stop: async () => "", cancel() {} };
  const parts = [];
  let interim = "";
  let active = true;
  let finished = null;
  let rec = null;
  let startedAt = 0;

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
        if (FATAL.has(e.error)) active = false;
      };
      rec.onend = () => {
        // Keep words that never got finalized before the session ended.
        if (interim.trim()) parts.push(interim.trim());
        interim = "";
        if (!active) return finished?.();
        // Chrome ends continuous sessions on silence; restart, but never in a tight loop.
        const wait = Math.max(0, 250 - (Date.now() - startedAt));
        setTimeout(() => (active ? launch() : finished?.()), wait);
      };
      startedAt = Date.now();
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
