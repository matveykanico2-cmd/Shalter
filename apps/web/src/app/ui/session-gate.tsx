import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router";

import { SignInView } from "@/views/sign-in";

import { type SelfUser, useSession } from "@/entities/session";

import { bootstrapQuery } from "../model/bootstrap";
import { useAppearance } from "../model/use-appearance";
import { useMessageSounds } from "../model/use-message-sounds";
import { useRealtime } from "../model/use-realtime";

import { AppRoutes } from "./app-routes";
import { Splash } from "./splash";

/** Экраны приложения — только со входом; без него — на /login. */
export function RequireSession() {
  const { data, isPending, isError, refetch } = useSession();
  if (isPending) return <Splash />;
  if (isError) {
    // Сервер недоступен: не выкидываем на вход, а предлагаем повторить.
    return (
      <div role="alert" onClick={() => void refetch()}>
        Нет связи с сервером — нажмите, чтобы повторить
      </div>
    );
  }
  if (!data.user) return <Navigate to="/login" replace />;
  return <SignedIn user={data.user} />;
}

function SignedIn({ user }: { user: SelfUser }) {
  const client = useQueryClient();
  useRealtime(user.id);
  useMessageSounds(user.id);
  const boot = useQuery(bootstrapQuery(client, user.id));
  useAppearance(!boot.isPending);
  return <AppRoutes user={user} chatsReady={!boot.isPending} />;
}

/** /login, когда вход уже есть, — сразу в приложение. */
export function GuestOnly() {
  const { data, isPending } = useSession();
  if (isPending) return <Splash />;
  if (data?.user) return <Navigate to="/" replace />;
  return <SignInView />;
}
