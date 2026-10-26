import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { callApi } from "@/features/call";

import { errorText } from "@/shared/lib/error-text";

import styles from "./call-view.module.css";

// Вход по ссылке — один запрос на ссылку, даже если экран смонтировался дважды (StrictMode).
const joins = new Map<string, ReturnType<typeof callApi.joinByLink>>();
const joinOnce = (token: string) => {
  let pending = joins.get(token);
  if (!pending) {
    pending = callApi.joinByLink(token).finally(() => setTimeout(() => joins.delete(token), 1000));
    joins.set(token, pending);
  }
  return pending;
};

/** /call-join/:token — ссылка-приглашение в звонок: входим и открываем экран звонка. */
export function CallJoinView() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    joinOnce(token).then(
      ({ call }) => alive && void navigate(`/call/${call.id}`, { replace: true }),
      (err: unknown) => alive && setError(errorText(err, "Звонок уже завершён, или ссылка устарела."))
    );
    return () => {
      alive = false;
    };
  }, [token, navigate]);
  if (!error) return null;
  return (
    <div className={styles.join}>
      <p className={styles.joinTitle}>Ссылка недействительна</p>
      <p className={styles.missing}>{error}</p>
    </div>
  );
}
