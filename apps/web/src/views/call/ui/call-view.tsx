import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";

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
    // Обычное открытие ссылки /call/:id не означает согласие принять входящий.
    // Раньше любой переход на экран сразу вызывал /answer, из-за чего трубка
    // «бралась сама», ещё до разрешения микрофона. Явный ?answer=1 приходит только
    // от кнопки системного уведомления; уже отвеченный/исходящий звонок можно восстановить.
    const open = async () => {
      if (getCall()?.call.id === callId) return;
      if (action !== "answer") {
        const found = (await callApi.list()).calls.find((call) => call.id === callId);
        if (!alive) return;
        if (found && found.callerId !== me.id && found.answered !== true && found.kind !== "voice-room") {
          await navigate("/", { replace: true });
          return;
        }
      }
      await joinCallById(callId, me, { answer: action === "answer", canStart: () => alive });
      // Ответ из системного уведомления — явное действие. Убираем маркер после
      // входа, не создавая дополнительную запись истории.
      if (alive && action === "answer") await navigate(`/call/${callId}`, { replace: true });
    };
    open()
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
  const ended = current?.phase === "ended";
  const endedChatId = ended ? current?.call.chatId ?? null : null;
  useEffect(() => {
    if (endedChatId) void navigate(`/chat/${endedChatId}`, { replace: true });
  }, [endedChatId, navigate]);

  if (action === "decline") return null;
  // Декларативный переход происходит в этом же рендере. Иначе CallScreen уже
  // успевал исчезнуть, а navigate из effect выполнялся кадром позже — появлялся
  // белый экран после сброса звонка.
  if (endedChatId) return <Navigate to={`/chat/${endedChatId}`} replace />;
  if (!current) return missing ? <p className={styles.missing}>Звонок не найден или уже завершён.</p> : null;
  return (
    <CallScreen
      s={current}
      me={me}
      onMinimize={() => void navigate(`/chat/${current.call.chatId}`)}
      onHangup={(chat) => void navigate(chat ? `/chat/${chat}` : "/", { replace: true })}
    />
  );
}
