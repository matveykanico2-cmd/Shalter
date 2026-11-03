import { useSyncExternalStore } from "react";

// Язык экранов входа, выбранный кнопкой «Continue in English» (как в Telegram). По умолчанию —
// русский: раньше экран сам переводился по стране IP, и человек из России за VPN видел
// наполовину английский вход. Выбор помним на устройстве и переносим в настройки после входа.
const KEY = "shalter.guestLanguage";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) || "ru";
  } catch {
    return "ru";
  }
}

let current = read();
// Человек сам нажал «Continue in …» на этом экране (а не язык остался с прошлого раза).
let picked = false;

export function getGuestLanguage(): string {
  return current;
}

/** Язык выбран кнопкой в этот заход — его можно перенести в аккаунт. */
export function guestLanguagePicked(): boolean {
  return picked;
}

export function setGuestLanguage(language: string): void {
  current = language || "ru";
  picked = true;
  try {
    if (current === "ru") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, current);
  } catch {
    // Хранилище недоступно — выбор действует до перезагрузки.
  }
  listeners.forEach((l) => l());
}

export function useGuestLanguage(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getGuestLanguage,
    getGuestLanguage
  );
}

/** «Продолжить на …» на самом этом языке — кнопка должна быть понятна тому, кому она нужна. */
export const CONTINUE_IN: Record<string, string> = {
  ru: "Продолжить на русском",
  en: "Continue in English",
  uk: "Продовжити українською",
  be: "Працягнуць па-беларуску",
  kk: "Қазақша жалғастыру",
  uz: "O‘zbek tilida davom etish",
  de: "Weiter auf Deutsch",
  fr: "Continuer en français",
  es: "Continuar en español",
  it: "Continua in italiano",
  pt: "Continuar em português",
  tr: "Türkçe devam et",
  pl: "Kontynuuj po polsku",
  zh: "继续使用中文",
  ja: "日本語で続ける",
  ko: "한국어로 계속",
  ar: "المتابعة بالعربية",
  hi: "हिंदी में जारी रखें",
};
