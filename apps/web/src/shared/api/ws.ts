// Клиент WebSocket — как public/js/lib/wsClient.js: один сокет на вкладку, события
// { type, … }, ping раз в 20 с и переподключение с нарастающей паузой. Сервер закрывает
// сокет кодом 4001, когда сеанс этого устройства завершён, — тогда причину выясняем по HTTP.
import type { wsChatDeleted, wsTypingUpdate } from "@shalter/shared/schemas/bots";
import type { wsLiveEnded, wsLiveMessage, wsLiveMessageDeleted, wsLiveMessageUpdated, wsLiveSignal, wsLiveStarted, wsLiveState } from "@shalter/shared/schemas/live";
import type { wsMessageDeleted, wsMessageNew, wsMessageRead, wsMessageUpdated, wsThreadMessage } from "@shalter/shared/schemas/messages";
import type { wsTopicsUpdated } from "@shalter/shared/schemas/topics";
import type { aiState, callAnswered, callIncoming, callParticipantsUpdated, callSignal, callUpdated, chatAdded, chatJoinDeclined, chatUpdated, communityUpdated, contactUpdated, presenceUpdate, voicechatUpdated } from "@shalter/shared/schemas/ws";
import type { z } from "zod";

type Of<S extends z.ZodType> = z.infer<S>;

/** Почему сервер закрыл сокет кодом 4001 (ответ GET /api/sessions). */
export type RevokeReason = "banned" | "session_revoked" | "signed_out";

export type WsEvents = {
  "message:new": Of<typeof wsMessageNew>;
  // streaming — промежуточные правки ответа ИИ, пока он печатает.
  "message:updated": Of<typeof wsMessageUpdated> & { streaming?: boolean };
  "message:deleted": Of<typeof wsMessageDeleted>;
  "message:read": Of<typeof wsMessageRead>;
  /** Ответ в ветке сообщения (в ленту не попадает). */
  "thread:message": Of<typeof wsThreadMessage>;
  "topics:updated": Of<typeof wsTopicsUpdated>;
  "chat:added": Of<typeof chatAdded>;
  "chat:updated": Of<typeof chatUpdated>;
  "chat:deleted": Of<typeof wsChatDeleted>;
  "community:updated": Of<typeof communityUpdated>;
  "presence:update": Of<typeof presenceUpdate>;
  /** Кто-то печатает (action: typing, upload_photo…; cancel — перестал). */
  "typing:update": Of<typeof wsTypingUpdate>;
  "contact:updated": Of<typeof contactUpdated>;
  /** Заявку на вступление отклонили. */
  "chat:join-declined": Of<typeof chatJoinDeclined>;
  /** Shalter AI пишет ответ (active) или закончил — кнопка «стоп» в поле ввода. */
  "ai:state": Of<typeof aiState>;
  /** Звонок: входящий, ответили на другом устройстве, сменился статус или участники, сигнал WebRTC. */
  "call:incoming": Of<typeof callIncoming>;
  "call:answered": Of<typeof callAnswered>;
  "call:updated": Of<typeof callUpdated>;
  "call:participants-updated": Of<typeof callParticipantsUpdated>;
  "call:signal": Of<typeof callSignal>;
  /** Голосовой чат группы начался, сменились участники или закончился (call: null). */
  "voicechat:updated": Of<typeof voicechatUpdated>;
  /** Эфир в чате начался или закончился. */
  "live:started": Of<typeof wsLiveStarted>;
  "live:ended": Of<typeof wsLiveEnded>;
  /** Эфир: сменились участники, чат эфира, сигнал WebRTC. */
  "live:state": Of<typeof wsLiveState>;
  "live:message": Of<typeof wsLiveMessage>;
  "live:message-updated": Of<typeof wsLiveMessageUpdated>;
  "live:message-deleted": Of<typeof wsLiveMessageDeleted>;
  "live:signal": Of<typeof wsLiveSignal>;
  /** Сокет (пере)открылся: пока его не было, события могли потеряться. */
  "ws:reconnected": { type: "ws:reconnected" };
  /** Сменился статус сокета (ws.status()) — для заголовка «Соединение…». */
  "ws:state": { type: "ws:state" };
  /** Сеанс этого устройства завершён; сокет больше не переподключается. */
  "ws:revoked": { type: "ws:revoked"; reason: RevokeReason };
};

export type WsEventType = keyof WsEvents;

const PING_EVERY_MS = 20_000;
const PONG_TIMEOUT_MS = 6_000;
const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 15_000;
// Короткие сбои не показываем, чтобы статус не мигал (public/js/lib/netStatus.js).
const DOWN_GRACE_MS = 2000;

/** open — сокет на связи; down — не на связи дольше пары секунд; everOpened — уже открывался. */
export type WsStatus = { open: boolean; down: boolean; everOpened: boolean };

type Handler = (event: never) => void;

export function createWsClient(url: () => string = defaultUrl) {
  const handlers = new Map<string, Set<Handler>>();
  let socket: WebSocket | null = null;
  let stopped = false;
  // Идёт выяснение причины 4001 — сами не переподключаемся.
  let revoking = false;
  let reconnectDelay = FIRST_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setTimeout> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;
  let status: WsStatus = { open: false, down: false, everOpened: false };
  let downTimer: ReturnType<typeof setTimeout> | undefined;

  function emit(event: { type: string; [key: string]: unknown }) {
    handlers.get(event.type)?.forEach((fn) => (fn as (e: unknown) => void)(event));
  }

  function setStatus(next: WsStatus) {
    if (next.open === status.open && next.down === status.down && next.everOpened === status.everOpened) return;
    status = next;
    emit({ type: "ws:state" });
  }

  function markOpen(open: boolean) {
    if (open) {
      clearTimeout(downTimer);
      downTimer = undefined;
      setStatus({ open: true, down: false, everOpened: true });
      return;
    }
    if (status.open) setStatus({ ...status, open: false });
    // Попытки переподключения не продлевают паузу: «не на связи» отсчитывается от первого обрыва.
    if (status.down || downTimer !== undefined) return;
    downTimer = setTimeout(() => {
      downTimer = undefined;
      setStatus({ ...status, down: true });
    }, DOWN_GRACE_MS);
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (stopped) return;
    const ws = new WebSocket(url());
    socket = ws;
    ws.addEventListener("open", () => {
      reconnectDelay = FIRST_DELAY_MS;
      markOpen(true);
      // И при первом открытии: данные по HTTP успевают загрузиться раньше сокета.
      emit({ type: "ws:reconnected" });
      schedulePing();
    });
    ws.addEventListener("message", (ev) => {
      clearTimeout(pongTimer);
      let msg: unknown;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || typeof (msg as { type?: unknown }).type !== "string") return;
      if ((msg as { type: string }).type === "pong") return;
      emit(msg as { type: string });
    });
    ws.addEventListener("close", (ev) => {
      if (socket !== ws) return;
      clearTimeout(pingTimer);
      clearTimeout(pongTimer);
      markOpen(false);
      if (ev.code === 4001) {
        void handleRevoked();
        return;
      }
      scheduleReconnect();
    });
    ws.addEventListener("error", () => ws.close());
  }

  // Как api.js при session_revoked / banned: защищённый маршрут скажет, что случилось.
  async function handleRevoked() {
    revoking = true;
    let res: Response;
    try {
      res = await fetch("/api/sessions", { credentials: "same-origin", cache: "no-store" });
    } catch {
      revoking = false;
      scheduleReconnect();
      return;
    }
    if (stopped) return;
    if (res.ok) {
      // Сеанс жив (закрыли сокет другого аккаунта этого устройства) — переподключаемся.
      revoking = false;
      scheduleReconnect();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (stopped) return;
    const reason: RevokeReason = body.error === "banned" ? "banned" : body.error === "session_revoked" ? "session_revoked" : "signed_out";
    emit({ type: "ws:revoked", reason } satisfies WsEvents["ws:revoked"]);
  }

  function scheduleReconnect() {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_DELAY_MS);
  }

  // Сокет «зомби» (OPEN, но данные не идут) — бросаем его и сразу открываем новый.
  function reconnectNow() {
    const dead = socket;
    socket = null;
    clearTimeout(pingTimer);
    clearTimeout(pongTimer);
    try {
      dead?.close();
    } catch {
      // уже закрыт
    }
    reconnectDelay = FIRST_DELAY_MS;
    connect();
  }

  function ping() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    clearTimeout(pongTimer);
    pongTimer = setTimeout(reconnectNow, PONG_TIMEOUT_MS);
    try {
      socket.send('{"type":"ping"}');
    } catch {
      reconnectNow();
    }
  }

  function schedulePing() {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => {
      ping();
      schedulePing();
    }, PING_EVERY_MS);
  }

  // Вернулись в приложение или появилась сеть — проверяем сокет сразу.
  function checkNow() {
    if (!socket || revoking || stopped) return;
    if (socket.readyState === WebSocket.OPEN) ping();
    else if (socket.readyState !== WebSocket.CONNECTING) reconnectNow();
  }
  const onVisibility = () => {
    if (!document.hidden) checkNow();
  };

  return {
    start() {
      if (socket) return;
      stopped = false;
      revoking = false;
      markOpen(false);
      connect();
      if (listening) return;
      listening = true;
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", checkNow);
      window.addEventListener("pageshow", checkNow);
    },
    /** Перед выходом: закрываем сами, 4001 от сервера уже не значит «сеанс завершён». */
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(pingTimer);
      clearTimeout(pongTimer);
      clearTimeout(downTimer);
      downTimer = undefined;
      status = { open: false, down: false, everOpened: false };
      const ws = socket;
      socket = null;
      try {
        ws?.close();
      } catch {
        // уже закрыт
      }
      if (!listening) return;
      listening = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", checkNow);
      window.removeEventListener("pageshow", checkNow);
    },
    isOpen: () => !!socket && socket.readyState === WebSocket.OPEN,
    /** Тот же объект, пока статус не сменился (для useSyncExternalStore). */
    status: () => status,
    send(payload: object) {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    },
    on<T extends WsEventType>(type: T, fn: (event: WsEvents[T]) => void): () => void {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(fn as Handler);
      return () => void handlers.get(type)?.delete(fn as Handler);
    },
  };
}

function defaultUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export type WsClient = ReturnType<typeof createWsClient>;

/** Сокет приложения. */
export const ws = createWsClient();
