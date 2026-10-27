import { vi } from "vitest";

/** Подмена WebSocket: сокеты складываются в sockets, сервер «отвечает» вызовами open/receive/close. */
export class FakeSocket extends EventTarget {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;
  public static sockets: FakeSocket[] = [];

  public readyState = FakeSocket.CONNECTING;
  public readonly sent: string[] = [];

  public constructor(public readonly url: string) {
    super();
    FakeSocket.sockets.push(this);
  }

  public send(data: string) {
    this.sent.push(data);
  }

  public close() {
    this.serverClose(1000);
  }

  public open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  public receive(event: object) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  }

  public serverClose(code: number) {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }

  public static last() {
    const socket = FakeSocket.sockets.at(-1);
    if (!socket) throw new Error("сокет не открывали");
    return socket;
  }
}

export function fakeSocket() {
  FakeSocket.sockets = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  return FakeSocket;
}
