import { useParams } from "react-router";

import { HomeView } from "@/views/home";
import { UsernameView } from "@/views/username";

/** Адрес из одного сегмента: /@имя — по нику, остальное — пока на главную. */
export function AtUsername() {
  const { username = "" } = useParams();
  return username.startsWith("@") ? <UsernameView /> : <HomeView />;
}
