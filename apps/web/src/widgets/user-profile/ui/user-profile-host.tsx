import { lazy, Suspense } from "react";

import { useSession } from "@/entities/session";
import { useOpenedProfile } from "@/entities/user";

// Панель — отдельным чанком: на старте она не нужна.
const UserProfilePanel = lazy(() => import("./user-profile-panel").then((m) => ({ default: m.UserProfilePanel })));

/** Панель профиля, открытая через openUserProfile(id) откуда угодно, — одна на приложение. */
export function UserProfileHost() {
  const userId = useOpenedProfile();
  const me = useSession().data?.user;
  if (!userId || !me) return null;
  // key: другой человек — своё состояние (вкладка, окна поверх).
  return (
    <Suspense fallback={null}>
      <UserProfilePanel key={userId} userId={userId} me={me} />
    </Suspense>
  );
}
