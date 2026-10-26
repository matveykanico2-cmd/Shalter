import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";

import { SignInView } from "@/views/sign-in";

import { rememberPendingShare } from "@/features/share-inbox";

import { type SelfUser, useSession } from "@/entities/session";

import { bootstrapQuery, persistChats, restoreCachedChats } from "../model/bootstrap";
import { useAppearance } from "../model/use-appearance";
import { useMessageSounds } from "../model/use-message-sounds";
import { useRealtime } from "../model/use-realtime";

import { AppRoutes } from "./app-routes";
import { AppServices } from "./app-services";
import { Splash } from "./splash";

/** Экраны приложения — только со входом; без него — на /login. */
export function RequireSession() {
  const { data, isPending, isError, refetch } = useSession();
  const { pathname } = useLocation();
  if (isPending) return <Splash />;
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
  return <SignedIn user={data.user} />;
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
  const [params] = useSearchParams();
  if (isPending) return <Splash />;
  if (data?.user && params.get("add") !== "1") return <Navigate to="/" replace />;
  return <SignInView />;
}
