import { lazy, Suspense } from "react";
import { useParams } from "react-router";

import { HomeView } from "@/views/home";

const UsernameView = lazy(() => import("@/views/username").then((m) => ({ default: m.UsernameView })));

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
