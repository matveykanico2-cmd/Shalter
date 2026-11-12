import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";

import { rememberPendingShare } from "@/features/share-inbox";

import { chatQueries } from "@/entities/chat";
import { loadStoredHistories, persistHistories } from "@/entities/message";
import { type SelfUser, sessionQueries, useSession } from "@/entities/session";

import { hideBootSplash } from "../model/boot-splash";
import { bootstrapQuery, persistChats, restoreCachedChats } from "../model/bootstrap";
import { useAppearance } from "../model/use-appearance";
import { useMessageSounds } from "../model/use-message-sounds";
import { useRealtime } from "../model/use-realtime";
import { useGuestUiTranslation } from "../model/use-ui-translation";

import { AppRoutes } from "./app-routes";
import { AppServices } from "./app-services";
import { Splash } from "./splash";

// Экран входа — отдельным чанком: вошедшему он на старте не нужен.
const SignInView = lazy(() => import("@/views/sign-in").then((m) => ({ default: m.SignInView })));

/** Экраны приложения — только со входом; без него — на /login. */
export function RequireSession() {
  const { data, isPending, isError, isPlaceholderData, refetch } = useSession();
  useHideSplash(!isPending);
  const { pathname } = useLocation();
  const stale = useStaleLastSession();
  if (isPending || stale) return <Splash />;
  if (isError) {
    // Сервер недоступен: не выкидываем на вход, а предлагаем повторить.
    return (
      <div role="alert" onClick={() => void refetch()}>
        Нет связи с сервером — нажмите, чтобы повторить
      </div>
    );
  }
  if (!data.user) {
    // Отправка из системного меню «Поделиться»: содержимое дожидается входа.
    if (pathname.startsWith("/share/")) rememberPendingShare(pathname.slice("/share/".length));
    return <Navigate to="/login" replace />;
  }
  return <SignedIn user={data.user} confirmed={!isPlaceholderData} />;
}

/** confirmed — сервер подтвердил, что вошёл именно user: до этого на устройство ничего не пишем. */
function SignedIn({ user, confirmed }: { user: SelfUser; confirmed: boolean }) {
  const client = useQueryClient();
  useRealtime(user.id);
  useMessageSounds(user.id);
  // Список из прошлого запуска — сразу, /api/bootstrap его заменит (localCache.js старого клиента).
  const [cached] = useState(() => restoreCachedChats(client, user.id));
  useEffect(() => (confirmed ? persistChats(client, user.id) : undefined), [client, user.id, confirmed]);
  // Ленты чатов прошлого запуска — открытый чат показывает сообщения, не дожидаясь сервера.
  useEffect(() => {
    void loadStoredHistories(user.id);
  }, [user.id]);
  useEffect(() => (confirmed ? persistHistories(client, user.id, (chatId) => keepsHistory(client, chatId)) : undefined), [client, user.id, confirmed]);
  const boot = useQuery(bootstrapQuery(client, user.id));
  useAppearance(!boot.isPending);
  return (
    <AppServices user={user} ready={!boot.isPending}>
      <AppRoutes user={user} chatsReady={cached || !boot.isPending} />
    </AppServices>
  );
}

/** Ленту хранить на устройстве можно: чат в списке и не секретный. */
function keepsHistory(client: QueryClient, chatId: string) {
  const chat = client.getQueryData(chatQueries.list().queryKey)?.find((c) => c.id === chatId);
  return !!chat && !chat.secret;
}

/** /login, когда вход уже есть, — сразу в приложение; /login?add=1 — добавить ещё один аккаунт. */
export function GuestOnly() {
  // Сеанс прошлого запуска здесь не в счёт: со входа уводим, только когда сервер его подтвердил.
  const { data: session, isPending: loading, isPlaceholderData } = useSession();
  const data = isPlaceholderData ? undefined : session;
  const isPending = loading || isPlaceholderData;
  useHideSplash(!isPending);
  const [params] = useSearchParams();
  const signedIn = !!data?.user && params.get("add") !== "1";
  // Без входа — экраны на языке страны (с ?add=1 язык уже выбран в аккаунте).
  useGuestUiTranslation(!isPending && !data?.user);
  if (isPending) return <Splash />;
  if (signedIn) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<Splash />}>
      <SignInView />
    </Suspense>
  );
}

/**
 * Приложение открылось под сеансом прошлого запуска, а сервер ответил, что вошёл другой
 * (или никто): всё прежнего аккаунта выбрасываем. Другой аккаунт — страница загружается
 * заново под ним, как при переключении; никто — остаётся только сеанс, дальше вход.
 * Только по ответу сервера: ошибка запроса (502 при выкладке, нет сети) — не выход.
 */
function useStaleLastSession() {
  const client = useQueryClient();
  const { data, isPlaceholderData, isSuccess } = useSession();
  // Под кем открылись (до ответа сервера); /login — другой маршрут, этот экран там размонтирован.
  const [shownId] = useState(() => (isPlaceholderData ? (data?.user?.id ?? null) : null));
  const stale = isSuccess && !isPlaceholderData && shownId !== null && shownId !== (data?.user?.id ?? null);
  const otherUser = stale && !!data?.user;
  useEffect(() => {
    if (!stale) return;
    if (otherUser) return void window.location.reload();
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionQueries.baseKey[0] });
  }, [stale, otherUser, client]);
  return otherUser;
}

/** Сеанс выяснен — заставка из index.html уходит. */
function useHideSplash(known: boolean) {
  useEffect(() => {
    if (known) hideBootSplash();
  }, [known]);
}
