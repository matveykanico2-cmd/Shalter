import { useSession } from "@/entities/session";
import { useOpenedProfile } from "@/entities/user";

import { UserProfilePanel } from "./user-profile-panel";

/** Панель профиля, открытая через openUserProfile(id) откуда угодно, — одна на приложение. */
export function UserProfileHost() {
  const userId = useOpenedProfile();
  const me = useSession().data?.user;
  if (!userId || !me) return null;
  // key: другой человек — своё состояние (вкладка, окна поверх).
  return <UserProfilePanel key={userId} userId={userId} me={me} />;
}
