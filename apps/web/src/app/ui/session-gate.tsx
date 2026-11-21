import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";

import { SignInView } from "@/views/sign-in";

import { rememberPendingShare } from "@/features/share-inbox";

import { chatPreview, chatQueries, type ChatSummary,chatTitle } from "@/entities/chat";
import { readCachedSession, type SelfUser, useSession } from "@/entities/session";

import { hideBootSplash } from "../model/boot-splash";
import { bootstrapQuery, persistChats, readCachedChats, restoreCachedChats } from "../model/bootstrap";
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
  const client = useQueryClient();
  // Открытая вкладка могла пережить выход/вход в другом окне — сверяем с сервером.
  useEffect(() => {
    // Начальная сессия уже запрошена useSession; не дублируем её сразу при mount.
    let lastCheck = Date.now();
    const refresh = () => {
      const now = Date.now();
      if (now - lastCheck < 5000 || document.visibilityState === "hidden") return;
      lastCheck = now;
      void refetch().then((result) => {
        if (result.data?.user) {
          void client.invalidateQueries({ queryKey: ["bootstrap", result.data.user.id] });
          void client.invalidateQueries({ queryKey: ["chats"] });
        }
      });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, refetch]);
  useHideSplash(!isPending);
  const { pathname, search, hash } = useLocation();
  if (isPending) {
    const cachedUser = readCachedSession()?.user;
    if (cachedUser) {
      const cachedChats = readCachedChats(cachedUser.id)?.chats;
      if (cachedChats?.length) return <CachedStartup chats={cachedChats} meId={cachedUser.id} />;
    }
    return <Splash />;
  }
  if (isError && (typeof navigator === "undefined" || navigator.onLine !== false || !data?.user)) {
    // Сервер недоступен: не выкидываем на вход, а предлагаем повторить.
    return <OfflineState retry={() => void refetch()} />;
  }
  if (!data?.user) {
    // Отправка из системного меню «Поделиться»: содержимое дожидается входа.
    if (pathname.startsWith("/share/")) rememberPendingShare(pathname.slice("/share/".length));
    const next = `${pathname}${search}${hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <SignedIn user={data.user} />;
}

function CachedStartup({ chats, meId }: { chats: ChatSummary[]; meId: string }) {
  return (
    <main className={styles.cachedStartup} aria-label="Загрузка чатов">
      <header className={styles.cachedHeader}>
        <span className={styles.cachedLogo} aria-hidden="true">S</span>
        <div><strong>Чаты</strong><span>Подключаемся…</span></div>
      </header>
      <section className={styles.cachedList} aria-label="Сохранённый список чатов">
        {chats.slice(0, 30).map((chat) => {
          const preview = chatPreview(chat, meId);
          return (
            <div className={styles.cachedRow} key={chat.id}>
              <span className={styles.cachedAvatar} aria-hidden="true">{chatTitle(chat).slice(0, 1).toUpperCase() || "•"}</span>
              <span className={styles.cachedCopy}><strong>{chatTitle(chat) || "Чат"}</strong><span>{preview.who}{preview.text}</span></span>
            </div>
          );
        })}
      </section>
      <span className={styles.cachedHint}>Обновляем данные…</span>
    </main>
  );
}

function OfflineState({ retry }: { retry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  useEffect(() => {
    // Не заставляем пользователя возвращаться к экрану и нажимать кнопку после
    // восстановления сети: браузер уже сообщает, что соединение вернулось.
    const onOnline = () => retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

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
  useState(() => {
    restoreCachedChats(client, user.id);
    return true;
  });
  useEffect(() => persistChats(client, user.id), [client, user.id]);
  const boot = useQuery(bootstrapQuery(client, user.id));
  // Повторный запуск не должен заменять готовый кэш заставкой: сначала показываем
  // сохранённую оболочку, а bootstrap тихо обновляет её в фоне.
  const hasCachedShell = client.getQueryData(chatQueries.list().queryKey) !== undefined;
  useAppearance(!boot.isPending);
  return (
    <AppServices user={user} ready={!boot.isPending}>
      {boot.isPending && !hasCachedShell ? <Splash /> : <AppRoutes user={user} />}
    </AppServices>
  );
}

/** /login, когда вход уже есть, — сразу в приложение; /login?add=1 — добавить ещё один аккаунт. */
export function GuestOnly() {
  const { data, isPending } = useSession();
  useHideSplash(!isPending);
  const [params] = useSearchParams();
  const signedIn = !!data?.user && params.get("add") !== "1";
  const requested = params.get("next");
  // Разрешаем только внутренний путь, чтобы ссылка после входа не стала открытым redirect.
  const destination = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  // Без входа — экраны на языке страны (с ?add=1 язык уже выбран в аккаунте).
  useGuestUiTranslation(!isPending && !data?.user);
  if (isPending) return <Splash />;
  if (signedIn) return <Navigate to={destination} replace />;
  return <SignInView />;
}

/** Сеанс выяснен — заставка из index.html уходит. */
function useHideSplash(known: boolean) {
  useEffect(() => {
    if (known) hideBootSplash();
  }, [known]);
}
