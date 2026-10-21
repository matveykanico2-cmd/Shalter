import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { WebSocketServer, type RawData } from "ws";
import { onAccessRevoked } from "../../legacy/legacy.js";
import { SessionCookiesService } from "../auth/session-cookies.service.js";
import { UsersRepository } from "../users/users.repository.js";
import type { ClientSocket } from "./model/domain.js";
import { RealtimeService } from "./realtime.service.js";
import { SocketRegistry } from "./stores/socket-registry.js";
import { WsSignalsService, type SignalMessage } from "./ws-signals.service.js";

const MAX_WS_PAYLOAD_BYTES = 64 * 1024;

// Телефон, закрывший приложение или потерявший сеть, не закрывает сокет — событие close
// не приходит, и человек висел «в сети» часами. Пингуем: кто не ответил за интервал,
// того отключаем (а с ним снимается и «в сети»).
const HEARTBEAT_MS = 30_000;

// Шлюз /ws на HTTP-сервере Nest. Протокол свой — { type, … } в обе стороны, вход по cookie
// при upgrade, закрытие 4001 при отзыве доступа, — поэтому без @nestjs/websockets: его
// шлюзы ждут { event, data } и не умеют отвечать HTTP-кодом на upgrade.
@Injectable()
export class WsGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private wss?: WebSocketServer;
  private heartbeat?: NodeJS.Timeout;

  public constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly sessionCookies: SessionCookiesService,
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService,
    private readonly sockets: SocketRegistry,
    private readonly signals: WsSignalsService
  ) {}

  public onApplicationBootstrap(): void {
    const server: Server = this.adapterHost.httpAdapter.getHttpServer();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD_BYTES });
    this.realtime.resetStalePresence();
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    this.heartbeat.unref();
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => this.upgrade(req, socket, head));
    // Сессию могли завершить с другого устройства, сменить пароль, удалить или забанить
    // аккаунт — открытые сокеты этого пользователя сверяются сразу.
    onAccessRevoked((uid) => this.realtime.closeRevokedSockets(uid));
  }

  public onApplicationShutdown(): void {
    clearInterval(this.heartbeat);
  }

  private ping(): void {
    for (const set of this.sockets.all()) {
      for (const ws of set) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {}
      }
    }
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    // Другого upgrade-обработчика на сервере нет: чужой путь — сразу 404, а не висящее соединение.
    if (req.url !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    const { userId: uid, deviceId } = this.sessionCookies.fromCookieHeader(req.headers.cookie);
    if (!uid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    this.wss!.handleUpgrade(req, socket, head, (raw) => this.connect(raw as ClientSocket, uid, deviceId));
  }

  private connect(ws: ClientSocket, uid: string, deviceId: string | null): void {
    // Забаненный не получает ни одного события: сокет сразу закрывается тем же кодом,
    // что и при бане на лету, — клиент реагирует на него одинаково.
    let banned = false;
    try {
      banned = !!this.users.findById(uid)?.isBanned;
    } catch (err) {
      console.error("ws ban check failed:", err);
    }
    if (banned) {
      ws.on("error", () => {});
      ws.close(4001, "session_revoked");
      return;
    }
    ws.uid = uid;
    ws.deviceId = deviceId;
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    if (this.sockets.add(ws)) this.realtime.markOnline(uid).catch((err: unknown) => console.error("presence online failed:", err));
    ws.on("message", (raw) => {
      this.handleMessage(ws, raw).catch((err: unknown) => console.error("ws message failed:", err));
    });
    // Без обработчика ошибка сокета (например, кадр больше maxPayload) становится
    // необработанной и роняет весь процесс. ws сам закрывает сокет (1009 и т. п.).
    ws.on("error", (err) => console.warn("ws error:", err.message));
    ws.on("close", () => {
      if (this.sockets.remove(ws)) this.realtime.markOffline(uid).catch((err: unknown) => console.error("presence offline failed:", err));
    });
  }

  private async handleMessage(ws: ClientSocket, raw: RawData): Promise<void> {
    let msg: SignalMessage & { type?: unknown };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    ws.isAlive = true;
    if (!msg || typeof msg !== "object") return;

    // Проверка живости от клиента: браузер не умеет слать ping-кадры протокола, а
    // «зомби»-сокет после сна телефона иначе выглядел бы открытым минутами.
    if (msg.type === "ping") {
      if (ws.readyState === ws.OPEN) ws.send('{"type":"pong"}');
      return;
    }
    if (msg.type === "live:signal:send") return this.signals.relayLiveSignal(ws.uid, msg);
    if (msg.type === "call:signal:send") return this.signals.relayCallSignal(ws.uid, msg);
  }
}
