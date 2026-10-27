import { useParams, useSearchParams } from "react-router";

import { UsernameScreen } from "@/features/open-profile";

import { useSession } from "@/entities/session";

/** /u/имя и /@имя — ссылка на человека, бота, канал или группу (openByUsername в public/js/app.js). */
export function UsernameView() {
  const { username = "" } = useParams();
  const [search] = useSearchParams();
  const me = useSession().data?.user;
  const name = username.replace(/^@/, "");
  if (!me || !/^[A-Za-z0-9_]{3,32}$/.test(name)) return null;
  return <UsernameScreen key={name.toLowerCase()} handle={name} me={me} search={search} />;
}
