import { vi } from "vitest";

/**
 * Подмена XMLHttpRequest для загрузок (shared/api/upload.ts): запросы копятся в requests,
 * тест отвечает respond/progress/fail.
 */
export class FakeXhr extends EventTarget {
  public static requests: FakeXhr[] = [];
  public readonly upload = new EventTarget();
  public method = "";
  public url = "";
  public body: unknown = null;
  public status = 0;
  public responseText = "";
  public aborted = false;

  public open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  public setRequestHeader() {}

  public send(body: unknown) {
    this.body = body;
    FakeXhr.requests.push(this);
  }

  public abort() {
    this.aborted = true;
    this.dispatchEvent(new Event("abort"));
  }

  public progress(loaded: number, total: number) {
    const e = Object.assign(new Event("progress"), { lengthComputable: true, loaded, total });
    this.upload.dispatchEvent(e);
  }

  public respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.dispatchEvent(new Event("load"));
  }

  public fail() {
    this.dispatchEvent(new Event("error"));
  }

  /** Параметры запроса: kind, name, mimeType. */
  public get params() {
    return Object.fromEntries(new URL(this.url, "http://x").searchParams);
  }
}

export function fakeXhr() {
  FakeXhr.requests = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:fake-${++n}`, revokeObjectURL: () => {} }));
}
