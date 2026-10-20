// WebSocket-клиент для тестов: копит все входящие события и умеет ждать нужное.
import WebSocket from "ws";
import type { Api } from "./client";

export interface WsEvent {
  type: string;
  [key: string]: any;
}

type Predicate = (e: WsEvent) => boolean;

export class WsClient {
  readonly events: WsEvent[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  private waiters: Array<{ type: string; pred: Predicate; resolve: (e: WsEvent) => void }> = [];

  constructor(readonly socket: WebSocket) {
    socket.on("message", (raw) => {
      let e: WsEvent;
      try {
        e = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.events.push(e);
      for (const w of [...this.waiters]) {
        if (w.type === e.type && w.pred(e)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(e);
        }
      }
    });
    this.closed = new Promise((resolve) => socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() })));
  }

  /** Ждёт событие type (уже пришедшее или будущее), подходящее под pred. */
  waitFor(type: string, pred: Predicate = () => true, timeoutMs = 5000): Promise<WsEvent> {
    const seen = this.events.find((e) => e.type === type && pred(e));
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const waiter = { type, pred, resolve: (e: WsEvent) => (clearTimeout(timer), resolve(e)) };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        const got = this.events.map((e) => e.type).join(", ") || "ничего";
        reject(new Error(`WS: не дождались «${type}» за ${timeoutMs} мс; пришло: ${got}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /** Проверяет, что за ms не пришло события type, подходящего под pred. */
  async expectNone(type: string, pred: Predicate = () => true, ms = 400): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    const hit = this.events.find((e) => e.type === type && pred(e));
    if (hit) throw new Error(`WS: пришло лишнее событие «${type}»: ${JSON.stringify(hit)}`);
  }

  /** Забыть накопленные события — чтобы следующий waitFor видел только новые. */
  clear() {
    this.events.length = 0;
  }

  send(msg: unknown) {
    this.socket.send(JSON.stringify(msg));
  }

  close() {
    this.socket.close();
    return this.closed;
  }
}

export function wsUrl(api: Api): string {
  return api.baseUrl.replace(/^http/, "ws") + "/ws";
}

/** Открывает сокет с cookie этого клиента; резолвится после открытия соединения. */
export function connectWs(api: Api): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(api), { headers: { cookie: api.cookieHeader() } });
    const client = new WsClient(socket);
    socket.once("open", () => resolve(client));
    socket.once("unexpected-response", (_req, res) => reject(new Error(`WS upgrade отклонён: ${res.statusCode}`)));
    socket.once("error", reject);
  });
}

/** Попытка подключиться, которая должна быть отклонена; возвращает HTTP-код ответа. */
export function rejectedWsStatus(api: Api): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(api), { headers: { cookie: api.cookieHeader() } });
    socket.once("open", () => {
      socket.close();
      reject(new Error("WS неожиданно подключился"));
    });
    socket.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    socket.once("error", () => {});
  });
}
