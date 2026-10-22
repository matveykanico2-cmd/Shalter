import { Navigate } from "react-router";

import { SignInView } from "@/views/sign-in";

import { AppShell } from "@/widgets/app-shell";

import { useSession } from "@/entities/session";

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
  return <AppShell user={data.user} />;
}

/** /login, когда вход уже есть, — сразу в приложение. */
export function GuestOnly() {
  const { data, isPending } = useSession();
  if (isPending) return <Splash />;
  if (data?.user) return <Navigate to="/" replace />;
  return <SignInView />;
}
