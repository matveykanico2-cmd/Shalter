import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { getCall, joinCallByLink } from "@/features/call";

import { useSession } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Button } from "@/shared/ui";

import styles from "./call-view.module.css";

/** /call-join/:token — ссылка-приглашение в звонок: входим и открываем экран звонка. */
export function CallJoinView() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const me = useSession().data?.user;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!me) return;
    joinCallByLink(token, me).then(
      () => {
        const callId = getCall()?.call.id;
        if (alive && callId) void navigate(`/call/${callId}`, { replace: true });
      },
      (err: unknown) => alive && setError(errorText(err, "Звонок уже завершён, или ссылка устарела."))
    );
    return () => {
      alive = false;
    };
  }, [me, token, navigate]);
  if (!error) return null;
  return (
    <div className={styles.join}>
      <p className={styles.joinTitle}>Ссылка недействительна</p>
      <p className={styles.missing}>{error}</p>
      <Button variant="secondary" onClick={() => void navigate(-1)}>Назад</Button>
    </div>
  );
}
