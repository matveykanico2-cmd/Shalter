import { Suspense } from "react";
import { useParams } from "react-router";

import { HomeView } from "@/views/home";

import { lazyView } from "@/shared/lib/lazy-view";

const UsernameView = lazyView(() => import("@/views/username").then((m) => m.UsernameView));

/** Адрес из одного сегмента: /@имя — по нику, остальное — пока на главную. */
export function AtUsername() {
  const { username = "" } = useParams();
  return username.startsWith("@") ? (
    <Suspense fallback={null}>
      <UsernameView />
    </Suspense>
  ) : (
    <HomeView />
  );
}
