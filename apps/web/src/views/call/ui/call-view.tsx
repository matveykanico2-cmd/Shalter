import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { callApi, CallScreen, decline, getCall, joinCallById, minimize, unminimize, useCall } from "@/features/call";

import { type SelfUser, useSession } from "@/entities/session";

import styles from "./call-view.module.css";

/** /call/:callId — экран звонка; ушли с него — звонок свернулся в пузырь. */
export function CallView() {
  const { callId = "" } = useParams();
  const me = useSession().data?.user;
  if (!me) return null;
  return <OpenCall key={callId} callId={callId} me={me} />;
}

function OpenCall({ callId, me }: { callId: string; me: SelfUser }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const s = useCall();
  const current = s?.call.id === callId ? s : null;
  const [missing, setMissing] = useState(false);
  // Чат звонка — туда экран уходит, когда звонок закончился.
  const [chatId, setChatId] = useState<string | null>(null);
  if (current && chatId !== current.call.chatId) setChatId(current.call.chatId);

  // «Отклонить» и «Ответить» в уведомлении-звонке (Android): ?decline=1 и ?answer=1.
  const action = params.get("decline") === "1" ? "decline" : params.get("answer") === "1" ? "answer" : null;
  useEffect(() => {
    let alive = true;
    if (action === "decline") {
      void callApi
        .list()
        .then(({ calls }) => decline(calls.find((c) => c.id === callId) ?? { id: callId }))
        .catch(() => {})
        .then(() => navigate("/", { replace: true }));
      return;
    }
    if (action === "answer") void navigate(`/call/${callId}`, { replace: true });
    joinCallById(callId, me)
      .catch(() => {})
      .then(() => {
        if (alive && getCall()?.call.id !== callId) setMissing(true);
      });
    return () => {
      alive = false;
    };
  }, [action, callId, me, navigate]);

  // На экране звонок не свёрнут; ушли с экрана — свернулся.
  useEffect(() => {
    unminimize();
    return () => {
      if (getCall()?.call.id === callId) minimize();
    };
  }, [callId]);

  // Звонок закончился (положили трубку здесь или у собеседника) — в его чат.
  const ended = !current && !!chatId;
  useEffect(() => {
    if (ended) void navigate(`/chat/${chatId}`, { replace: true });
  }, [ended, chatId, navigate]);

  if (action === "decline") return null;
  if (!current) return missing && !ended ? <p className={styles.missing}>Звонок не найден или уже завершён.</p> : null;
  return (
    <CallScreen
      s={current}
      me={me}
      onMinimize={() => void navigate(`/chat/${current.call.chatId}`)}
      onHangup={(chat) => void navigate(chat ? `/chat/${chat}` : "/", { replace: true })}
    />
  );
}
