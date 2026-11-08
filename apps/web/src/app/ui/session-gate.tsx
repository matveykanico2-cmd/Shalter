import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";

import { SignInView } from "@/views/sign-in";

import { rememberPendingShare } from "@/features/share-inbox";

import { type SelfUser, useSession } from "@/entities/session";

import { hideBootSplash } from "../model/boot-splash";
import { bootstrapQuery, persistChats, restoreCachedChats } from "../model/bootstrap";
import { useAppearance } from "../model/use-appearance";
import { useMessageSounds } from "../model/use-message-sounds";
import { useRealtime } from "../model/use-realtime";
import { useGuestUiTranslation } from "../model/use-ui-translation";

import { AppRoutes } from "./app-routes";
import { AppServices } from "./app-services";
import styles from "./session-gate.module.css";
import { Splash } from "./splash";

/** Экраны приложения — только со входом; без него — на /login. */
export function RequireSession() {
  const { data, isPending, isError, refetch } = useSession();
  useHideSplash(!isPending);
  const { pathname } = useLocation();
  if (isPending) return <Splash />;
  if (isError) {
    // Сервер недоступен: не выкидываем на вход, а предлагаем повторить.
    return <OfflineState retry={() => void refetch()} />;
  }
  if (!data.user) {
    // Отправка из системного меню «Поделиться»: содержимое дожидается входа.
    if (pathname.startsWith("/share/")) rememberPendingShare(pathname.slice("/share/".length));
    return <Navigate to="/login" replace />;
  }
  return <SignedIn user={data.user} />;
}

function OfflineState({ retry }: { retry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <main className={styles.offline} role="alert">
      <div className={styles.offlineGlow} />
      <div className={styles.offlineCard}>
        <div className={styles.offlineIcon} aria-hidden="true"><span /><span /><span /></div>
        <h1>{offline ? "Нет подключения к интернету" : "Shalter временно недоступен"}</h1>
        <p>{offline ? "Проверьте Wi‑Fi или мобильную сеть. Чаты появятся автоматически после подключения." : "Не удалось связаться с сервером. Ваши сообщения и данные в безопасности."}</p>
        <button type="button" onClick={retry}>Попробовать снова</button>
      </div>
    </main>
  );
}

function SignedIn({ user }: { user: SelfUser }) {
  const client = useQueryClient();
  useRealtime(user.id);
  useMessageSounds(user.id);
  // Список из прошлого запуска — сразу, /api/bootstrap его заменит (localCache.js старого клиента).
  const [cached] = useState(() => restoreCachedChats(client, user.id));
  useEffect(() => persistChats(client, user.id), [client, user.id]);
  const boot = useQuery(bootstrapQuery(client, user.id));
  useAppearance(!boot.isPending);
  return (
    <AppServices user={user} ready={!boot.isPending}>
      <AppRoutes user={user} chatsReady={cached || !boot.isPending} />
    </AppServices>
  );
}

/** /login, когда вход уже есть, — сразу в приложение; /login?add=1 — добавить ещё один аккаунт. */
export function GuestOnly() {
  const { data, isPending } = useSession();
  useHideSplash(!isPending);
  const [params] = useSearchParams();
  const signedIn = !!data?.user && params.get("add") !== "1";
  // Без входа — экраны на языке страны (с ?add=1 язык уже выбран в аккаунте).
  useGuestUiTranslation(!isPending && !data?.user);
  if (isPending) return <Splash />;
  if (signedIn) return <Navigate to="/" replace />;
  return <SignInView />;
}

/** Сеанс выяснен — заставка из index.html уходит. */
function useHideSplash(known: boolean) {
  useEffect(() => {
    if (known) hideBootSplash();
  }, [known]);
}
