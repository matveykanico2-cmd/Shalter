import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { AuthFrame, SignInForm, type SignInMode } from "@/features/sign-in";

import { sessionQueries } from "@/entities/session";
import { patchSettings } from "@/entities/settings";

import { CONTINUE_IN, getGuestLanguage, guestLanguagePicked, setGuestLanguage, useGuestLanguage } from "@/shared/lib/guest-language";

import styles from "./sign-in-view.module.css";

/** /login; /login?add=1 — ещё один аккаунт на этом устройстве, с «назад» в приложение. */
export function SignInView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<SignInMode>("login");
  const addMode = params.get("add") === "1";
  const language = useGuestLanguage();
  // Предлагаем язык страны (или браузера), если он не русский, иначе английский.
  const detected = useQuery(sessionQueries.guestLanguage()).data?.language;
  const offer = detected && detected !== "ru" && CONTINUE_IN[detected] ? detected : "en";
  const next = language === "ru" ? offer : "ru";
  const registered = useRef(false);
  const signedIn = async () => {
    // Язык экрана — в настройки аккаунта: новому аккаунту всегда (иначе сервер выбрал бы язык по
    // IP, и за VPN интерфейс стал бы английским), при входе — только если язык выбрали кнопкой
    // сейчас: старый выбор с этого устройства не должен перетирать настройку аккаунта.
    if (registered.current || guestLanguagePicked()) await patchSettings({ uiLanguage: getGuestLanguage() }).catch(() => null);
    // Добавленный аккаунт — полная перезагрузка: кэш прежнего не должен в нём остаться.
    if (addMode) window.location.assign("/");
    else void navigate("/", { replace: true });
  };
  // Сюда приводит сокет, закрытый сервером (public/js/lib/wsClient.js — так же).
  const notice = params.get("reason") === "revoked" ? "Сеанс на этом устройстве был завершён — войдите снова." : undefined;
  return (
    <AuthFrame
      title={addMode ? "Добавить аккаунт" : "Shalter"}
      subtitle={mode === "login" ? "Рады видеть вас снова" : mode === "setup" ? "Почти готово" : "Быстро, красиво и по-настоящему безопасно"}
      onBack={addMode ? () => window.location.assign("/") : undefined}
    >
      <SignInForm
        notice={notice}
        onModeChange={(m) => {
          if (m === "setup") registered.current = true;
          setMode(m);
        }}
        onSignedIn={() => void signedIn()}
      />
      {mode !== "setup" ? (
        <button type="button" className={styles.language} translate="no" onClick={() => setGuestLanguage(next)}>
          {CONTINUE_IN[next] ?? CONTINUE_IN.en}
        </button>
      ) : null}
    </AuthFrame>
  );
}
