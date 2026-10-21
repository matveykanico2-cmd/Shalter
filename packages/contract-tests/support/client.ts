// HTTP-клиент «как браузер»: свой набор cookie на каждого пользователя/устройство.
// Сессия в Shalter — это cookie session_uids + active_uid + device_id, поэтому
// один Api = одно устройство одного человека.

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  text: string;
  headers: Headers;
}

export interface RequestOptions {
  json?: unknown;
  form?: FormData;
  body?: BodyInit;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
}

export class Api {
  readonly cookies = new Map<string, string>();

  constructor(readonly baseUrl: string) {}

  /** Новое «устройство» с теми же cookie — например, второй вкладкой. */
  clone(): Api {
    const copy = new Api(this.baseUrl);
    for (const [k, v] of this.cookies) copy.cookies.set(k, v);
    return copy;
  }

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
  }

  url(path: string, query?: RequestOptions["query"]): string {
    const u = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async request<T = any>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...opts.headers };
    let body: BodyInit | undefined = opts.body;
    if (opts.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = opts.form;
    }
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;

    const res = await fetch(this.url(path, opts.query), { method, headers, body, redirect: "manual" });
    this.storeCookies(res.headers);
    const text = await res.text();
    let parsed: any = text;
    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      try {
        parsed = JSON.parse(text);
      } catch {}
    }
    return { status: res.status, body: parsed as T, text, headers: res.headers };
  }

  get<T = any>(path: string, opts?: RequestOptions) {
    return this.request<T>("GET", path, opts);
  }
  post<T = any>(path: string, json?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("POST", path, { ...opts, json: json ?? opts.json });
  }
  patch<T = any>(path: string, json?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("PATCH", path, { ...opts, json: json ?? opts.json });
  }
  delete<T = any>(path: string, json?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("DELETE", path, { ...opts, json: json ?? opts.json });
  }

  private storeCookies(headers: Headers) {
    for (const raw of headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";");
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const name = pair.slice(0, idx).trim();
      const value = decodeURIComponent(pair.slice(idx + 1).trim());
      const expired = attrs.some((a) => {
        const [k, v] = a.trim().split("=");
        if (k.toLowerCase() === "max-age") return Number(v) <= 0;
        if (k.toLowerCase() === "expires") return Date.parse(v) <= Date.now();
        return false;
      });
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}
