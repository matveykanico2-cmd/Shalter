import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
// @ts-expect-error no types
import QRCode from "qrcode";
// @ts-expect-error no types
import jsQR from "jsqr";

/* ───────────────────────── Типы ───────────────────────── */

export type ProxyType = "mtproto" | "socks5";

export interface ProxyData {
  type: ProxyType;
  server: string;
  port: number;
  secret?: string; // MTProto
  user?: string; // SOCKS5
  pass?: string; // SOCKS5
}
export interface Proxy extends ProxyData {
  id: string;
}
interface PingState {
  status: "checking" | "ok" | "fail";
  ms?: number;
  detail?: string;
}
interface PingResult {
  ok: boolean;
  ms?: number;
  detail: string;
}
type SheetState = null | { kind: "add" } | { kind: "scan" } | { kind: "share"; proxy: Proxy };

const TOKEN_KEY = "proxy-hub:token";
const DEVICE_KEY = "proxy-hub:device";

/* ───────────────────────── Ссылки ───────────────────────── */

const isValidPort = (n: number) => Number.isInteger(n) && n >= 1 && n <= 65535;
const isValidSecret = (s: string) => /^[0-9a-fA-F]{32,}$/.test(s) || /^[A-Za-z0-9_-]{22,}$/.test(s);

/** Ссылка, которую понимает Telegram (и для QR, и для «Поделиться») */
export function buildShareLink(p: ProxyData, scheme: "https" | "tg" = "https"): string {
  const kind = p.type === "mtproto" ? "proxy" : "socks";
  const q = new URLSearchParams({ server: p.server, port: String(p.port) });
  if (p.type === "mtproto" && p.secret) q.set("secret", p.secret);
  if (p.type === "socks5") {
    if (p.user) q.set("user", p.user);
    if (p.pass) q.set("pass", p.pass);
  }
  return scheme === "https" ? `https://t.me/${kind}?${q}` : `tg://${kind}?${q}`;
}

/** Разбор tg://proxy, tg://socks, https://t.me/proxy, https://t.me/socks */
export function parseProxyLink(raw: string): ProxyData | null {
  try {
    const url = new URL(raw.trim());
    const isTme = url.hostname === "t.me" || url.hostname === "telegram.me";
    if (url.protocol !== "tg:" && !isTme) return null;
    const kind = url.protocol === "tg:" ? url.hostname : url.pathname.replace(/^\/+/, "");

    const server = url.searchParams.get("server") ?? "";
    const port = Number(url.searchParams.get("port"));
    if (!server || !isValidPort(port)) return null;

    if (kind === "proxy") {
      const secret = url.searchParams.get("secret") ?? "";
      return isValidSecret(secret) ? { type: "mtproto", server, port, secret } : null;
    }
    if (kind === "socks") {
      return {
        type: "socks5",
        server,
        port,
        user: url.searchParams.get("user") || undefined,
        pass: url.searchParams.get("pass") || undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/* ───────────────────────── API (свой сервер) ───────────────────────── */

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/* ───────────────────────── Состояние устройства ───────────────────────── */

interface Device {
  activeId: string | null;
  enabled: boolean;
}
function loadDevice(): Device {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) return JSON.parse(raw) as Device;
  } catch {
    /* ignore */
  }
  return { activeId: null, enabled: false };
}

/* ───────────────────────── Главный компонент ───────────────────────── */

export default function ProxyManager() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [needToken, setNeedToken] = useState(false);
  const [pings, setPings] = useState<Record<string, PingState>>({});
  const [device, setDevice] = useState<Device>(loadDevice);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    } catch {
      /* ignore */
    }
  }, [device]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      setProxies(await api<Proxy[]>("/proxies"));
      setOffline(false);
      setNeedToken(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedToken(true);
      else setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* ── Пинг ── */
  const pingOne = useCallback(async (id: string) => {
    setPings((s) => ({ ...s, [id]: { ...s[id], status: "checking" } }));
    try {
      const r = await api<PingResult>(`/proxies/${id}/ping`, { method: "POST" });
      setPings((s) => ({ ...s, [id]: r.ok ? { status: "ok", ms: r.ms, detail: r.detail } : { status: "fail", detail: r.detail } }));
    } catch {
      setPings((s) => ({ ...s, [id]: { status: "fail", detail: "сервер недоступен" } }));
    }
  }, []);

  const idsKey = useMemo(() => proxies.map((p) => p.id).join(","), [proxies]);
  void idsKey;
  const pingAll = useCallback(() => {
    for (const p of proxies) {
      void pingOne(p.id);
    }
  }, [proxies, pingOne]);

  // Проверка при загрузке списка и затем раз в минуту, пока вкладка открыта
  useEffect(() => {
    if (proxies.length === 0) return;
    for (const p of proxies) void pingOne(p.id);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        for (const p of proxies) void pingOne(p.id);
      }
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        for (const p of proxies) void pingOne(p.id);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [proxies, pingOne]);

  /* ── Действия ── */
  const addProxy = useCallback(async (data: ProxyData): Promise<boolean> => {
    try {
      const p = await api<Proxy>("/proxies", { method: "POST", body: JSON.stringify(data) });
      setProxies((s) => [...s, p]);
      setToast("Прокси добавлен");
      return true;
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "Не удалось сохранить");
      return false;
    }
  }, []);

  const removeProxy = async (p: Proxy) => {
    if (!window.confirm(`Удалить ${p.server}:${p.port}?`)) return;
    try {
      await api(`/proxies/${p.id}`, { method: "DELETE" });
      setProxies((s) => s.filter((x) => x.id !== p.id));
      setDevice((d) => (d.activeId === p.id ? { activeId: null, enabled: false } : d));
    } catch {
      setToast("Не удалось удалить");
    }
  };

  /** Выбираем прокси и открываем tg://-ссылку: Telegram сам предложит подключиться */
  const connect = (p: Proxy) => {
    setDevice({ activeId: p.id, enabled: true });
    window.location.href = buildShareLink(p, "tg");
  };

  const toggle = () => {
    if (proxies.length === 0) return setSheet({ kind: "add" });
    setDevice((d) => {
      const valid = proxies.some((p) => p.id === d.activeId);
      const first = proxies[0];
      if (!first) return { enabled: false, activeId: null };
      return { enabled: !(d.enabled && valid), activeId: valid ? d.activeId : first.id };
    });
  };

  const active = useMemo(() => proxies.find((p) => p.id === device.activeId), [proxies, device.activeId]);
  const isOn = device.enabled && Boolean(active);

  /* ── Разметка ── */
  return (
    <div className="pm">
      <style>{css}</style>

      <header className="pm-head">
        <h1>Прокси</h1>
        <button className="pm-link" onClick={pingAll} disabled={proxies.length === 0}>
          Проверить все
        </button>
      </header>

      {needToken && <TokenBanner onSaved={() => void refresh()} />}
      {offline && (
        <p className="pm-banner" role="alert">
          Сервер недоступен. <button className="pm-link" onClick={() => void refresh()}>Повторить</button>
        </p>
      )}

      <label className="pm-row pm-switch">
        <span>Использовать прокси</span>
        <input type="checkbox" role="switch" checked={isOn} onChange={toggle} />
        <i aria-hidden />
      </label>
      {isOn && active && (
        <p className="pm-state" aria-live="polite">
          Выбран {active.server}:{active.port}
        </p>
      )}

      <div className="pm-section">Список прокси</div>

      {!loaded ? (
        <div className="pm-empty">Загрузка…</div>
      ) : proxies.length === 0 ? (
        <div className="pm-empty">
          <p>Здесь пока пусто.</p>
          <p>Отсканируйте QR-код, вставьте ссылку t.me/proxy или добавьте прокси вручную.</p>
        </div>
      ) : (
        <ul className="pm-list">
          {proxies.map((p) => {
            const isActive = isOn && p.id === device.activeId;
            return (
              <li key={p.id} className={isActive ? "is-active" : ""}>
                <button className="pm-item" onClick={() => connect(p)} aria-pressed={isActive} aria-label={`Подключиться к ${p.server}`}>
                  <span className="pm-radio" aria-hidden />
                  <span className="pm-main">
                    <b>
                      {p.server}:{p.port}
                    </b>
                    <small>
                      {p.type === "mtproto" ? "MTProto" : "SOCKS5"} · <PingText state={pings[p.id]} />
                    </small>
                  </span>
                </button>
                <div className="pm-actions">
                  <button className="pm-icon" onClick={() => void pingOne(p.id)} aria-label="Проверить пинг">
                    <PulseIcon />
                  </button>
                  <button className="pm-icon" onClick={() => setSheet({ kind: "share", proxy: p })} aria-label="Поделиться">
                    <QrIcon />
                  </button>
                  <button className="pm-icon" onClick={() => void removeProxy(p)} aria-label="Удалить">
                    <TrashIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pm-bar">
        <button className="pm-secondary" onClick={() => setSheet({ kind: "scan" })}>
          Сканировать QR
        </button>
        <button className="pm-primary" onClick={() => setSheet({ kind: "add" })}>
          Добавить прокси
        </button>
      </div>

      {sheet?.kind === "add" && (
        <AddSheet
          onClose={() => setSheet(null)}
          onScan={() => setSheet({ kind: "scan" })}
          onSave={async (d) => {
            if (await addProxy(d)) setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "scan" && (
        <ScanSheet
          onClose={() => setSheet(null)}
          onFound={async (d) => {
            setSheet(null);
            await addProxy(d);
          }}
        />
      )}
      {sheet?.kind === "share" && <ShareSheet proxy={sheet.proxy} onClose={() => setSheet(null)} onToast={setToast} />}

      {toast && (
        <div className="pm-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Пинг: подпись ───────────────────────── */

function PingText({ state }: { state?: PingState }) {
  if (!state) return <span>не проверен</span>;
  if (state.status === "checking") return <span>проверка…</span>;
  if (state.status === "fail") return <span className="bad">{state.detail ?? "недоступен"}</span>;
  const ms = state.ms ?? 0;
  const tone = ms < 150 ? "ok" : ms < 400 ? "warn" : "bad";
  return (
    <span className={tone} title={state.detail}>
      {ms} мс
    </span>
  );
}

/* ───────────────────────── Токен доступа ───────────────────────── */

function TokenBanner({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  const wasRejected = Boolean(localStorage.getItem(TOKEN_KEY));
  return (
    <div className="pm-banner">
      {wasRejected && (
        <p className="pm-error" role="alert">
          Токен не подошёл. Проверьте API_TOKEN на сервере.
        </p>
      )}
      <label className="pm-field">
        Токен доступа (API_TOKEN на вашем сервере)
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
      </label>
      <button
        className="pm-primary"
        onClick={() => {
          localStorage.setItem(TOKEN_KEY, value.trim());
          onSaved();
        }}
      >
        Войти
      </button>
    </div>
  );
}

/* ───────────────────────── Добавление вручную ───────────────────────── */

function AddSheet({
  onClose,
  onScan,
  onSave,
}: {
  onClose: () => void;
  onScan: () => void;
  onSave: (d: ProxyData) => void | Promise<void>;
}) {
  const [type, setType] = useState<ProxyType>("mtproto");
  const [server, setServer] = useState("");
  const [port, setPort] = useState("");
  const [secret, setSecret] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fromLink = (text: string): boolean => {
    const d = parseProxyLink(text);
    if (!d) return false;
    setType(d.type);
    setServer(d.server);
    setPort(String(d.port));
    setSecret(d.secret ?? "");
    setUser(d.user ?? "");
    setPass(d.pass ?? "");
    setError(null);
    return true;
  };

  const submit = () => {
    const portNum = Number(port);
    const host = server.trim();
    if (!host || /\s/.test(host)) return setError("Укажите адрес сервера без пробелов");
    if (!isValidPort(portNum)) return setError("Порт — число от 1 до 65535");
    if (type === "mtproto") {
      if (!isValidSecret(secret.trim())) return setError("Секрет — hex-строка от 32 символов или base64url");
      return void onSave({ type, server: host, port: portNum, secret: secret.trim() });
    }
    void onSave({ type, server: host, port: portNum, user: user.trim() || undefined, pass: pass || undefined });
  };

  return (
    <Sheet title="Новый прокси" onClose={onClose}>
      <button className="pm-secondary pm-wide" onClick={onScan}>
        Сканировать QR-код
      </button>

      <label className="pm-field">
        Или вставьте ссылку
        <input
          placeholder="https://t.me/proxy?server=…"
          onChange={(e) => fromLink(e.target.value)}
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>

      <div className="pm-seg" role="tablist">
        {(["mtproto", "socks5"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)}>
            {t === "mtproto" ? "MTProto" : "SOCKS5"}
          </button>
        ))}
      </div>

      <label className="pm-field">
        Сервер
        <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="proxy.example.com" autoCapitalize="none" spellCheck={false} />
      </label>
      <label className="pm-field">
        Порт
        <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" placeholder="443" />
      </label>

      {type === "mtproto" ? (
        <label className="pm-field">
          Секрет
          <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ee1234…" autoCapitalize="none" spellCheck={false} />
        </label>
      ) : (
        <>
          <label className="pm-field">
            Логин (необязательно)
            <input value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" />
          </label>
          <label className="pm-field">
            Пароль (необязательно)
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
        </>
      )}

      {error && (
        <p className="pm-error" role="alert">
          {error}
        </p>
      )}

      <div className="pm-sheet-actions">
        <button className="pm-secondary" onClick={onClose}>
          Отмена
        </button>
        <button className="pm-primary" onClick={submit}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Поделиться: QR, скачать, отправить ───────────────────────── */

function ShareSheet({ proxy, onClose, onToast }: { proxy: Proxy; onClose: () => void; onToast: (t: string) => void }) {
  const link = buildShareLink(proxy);
  const [qr, setQr] = useState<string | null>(null);
  const fileName = `proxy-${proxy.server}-${proxy.port}.png`;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } } as any)
      .then((url: string) => alive && setQr(url))
      .catch(() => alive && onToast("Не удалось создать QR"));
    return () => {
      alive = false;
    };
  }, [link, onToast]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      onToast("Ссылка скопирована");
    } catch {
      onToast("Буфер обмена недоступен");
    }
  };

  /** Системное меню «Отправить» с картинкой QR; если не поддерживается — открываем диалог выбора чата в Telegram */
  const send = async () => {
    if (!qr) return;
    try {
      const blob = await (await fetch(qr)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Прокси для Telegram", text: link });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    const u = new URL("https://t.me/share/url");
    u.searchParams.set("url", link);
    u.searchParams.set("text", "Прокси для Telegram");
    window.open(u.toString(), "_blank", "noopener");
  };

  return (
    <Sheet title="Поделиться прокси" onClose={onClose}>
      <div className="pm-qr">{qr ? <img src={qr} alt={`QR-код прокси ${proxy.server}:${proxy.port}`} /> : <span>Создаём QR…</span>}</div>
      <p className="pm-hint pm-center">
        {proxy.type === "mtproto" ? "MTProto" : "SOCKS5"} · {proxy.server}:{proxy.port}
      </p>
      <p className="pm-hint pm-center">Любой, у кого есть этот QR или ссылка, сможет пользоваться прокси.</p>

      <div className="pm-grid">
        <a className={`pm-secondary pm-btn ${qr ? "" : "is-disabled"}`} href={qr ?? undefined} download={fileName} aria-disabled={!qr}>
          Скачать QR
        </a>
        <button className="pm-primary" onClick={() => void send()} disabled={!qr}>
          Отправить в чат
        </button>
        <button className="pm-secondary" onClick={() => void copy()}>
          Копировать ссылку
        </button>
        <a className="pm-secondary pm-btn" href={buildShareLink(proxy, "tg")}>
          Открыть в Telegram
        </a>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Сканер QR (камера или фото) ───────────────────────── */

function ScanSheet({ onClose, onFound }: { onClose: () => void; onFound: (d: ProxyData) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const foundRef = useRef(onFound);
  foundRef.current = onFound;
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Наведите камеру на QR-код прокси");

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Камера работает только по HTTPS или на localhost. Можно выбрать фото с QR-кодом.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = videoRef.current;
        if (!video || stopped) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();

        const tick = () => {
          if (stopped) return;
          if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code) {
              const parsed = parseProxyLink(code.data);
              if (parsed) {
                stopped = true;
                foundRef.current(parsed);
                return;
              }
              setHint("Это QR-код, но не прокси Telegram");
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(denied ? "Нет доступа к камере. Разрешите её в настройках браузера или выберите фото." : "Не удалось включить камеру.");
      }
    };
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      const parsed = code ? parseProxyLink(code.data) : null;
      if (parsed) onFound(parsed);
      else setHint(code ? "Это QR-код, но не прокси Telegram" : "На фото не найден QR-код");
    } catch {
      setHint("Не удалось прочитать изображение");
    }
  };

  return (
    <Sheet title="Сканировать QR" onClose={onClose}>
      {error ? (
        <p className="pm-error" role="alert">
          {error}
        </p>
      ) : (
        <div className="pm-scan">
          <video ref={videoRef} muted playsInline />
          <span className="pm-frame" aria-hidden />
        </div>
      )}
      <p className="pm-hint pm-center" aria-live="polite">
        {hint}
      </p>
      <div className="pm-sheet-actions">
        <label className="pm-secondary pm-btn">
          Выбрать фото
          <input type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void fromPhoto(f);
            }} />
        </label>
        <button className="pm-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Общее ───────────────────────── */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="pm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pm-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const icon = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const PulseIcon = () => (
  <svg {...icon}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);
const QrIcon = () => (
  <svg {...icon}>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
  </svg>
);
const TrashIcon = () => (
  <svg {...icon}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </svg>
);

/* ───────────────────────── Стили ───────────────────────── */

const css = `
.pm{--bg:#fff;--surface:#f1f3f5;--text:#14181c;--muted:#6b7580;--accent:#2a8de0;--ok:#2a9d5b;--warn:#c7871a;--bad:#d64545;--line:#e3e7ea;
  max-width:440px;margin:0 auto;min-height:100vh;padding:16px 16px 110px;background:var(--bg);color:var(--text);
  font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){.pm{--bg:#17212b;--surface:#1f2c3a;--text:#f2f5f7;--muted:#8a99a8;--accent:#5eb5f7;--ok:#4fcf8a;--warn:#f0b64a;--bad:#ff7a7a;--line:#2a3a4b}}
body{background:#fff}@media (prefers-color-scheme:dark){body{background:#17212b}}
.pm *{box-sizing:border-box}
:where(.pm button,.pm .pm-btn){font:inherit;color:inherit;cursor:pointer;border:0;background:none}
.pm button:focus-visible,.pm input:focus-visible,.pm a:focus-visible,.pm label:focus-within{outline:2px solid var(--accent);outline-offset:2px}
.pm button:disabled{opacity:.5;cursor:default}
.pm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.pm-head h1{font-size:22px;margin:0}
.pm-link{color:var(--accent);padding:6px 0}.pm-link:disabled{color:var(--muted)}
.pm-banner{background:var(--surface);border-radius:12px;padding:12px 16px;margin:0 0 12px;font-size:14px}
.pm-banner .pm-primary{width:100%;padding:10px;border-radius:10px;font-weight:600}
.pm-row{display:flex;justify-content:space-between;align-items:center;background:var(--surface);padding:14px 16px;border-radius:12px}
.pm-switch{position:relative;cursor:pointer}
.pm-switch input{position:absolute;opacity:0;inset:0;cursor:pointer;margin:0}
.pm-switch i{width:46px;height:28px;border-radius:14px;background:var(--line);position:relative;transition:background .2s;flex:none}
.pm-switch i::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s}
.pm-switch input:checked+i{background:var(--accent)}
.pm-switch input:checked+i::after{transform:translateX(18px)}
.pm-switch input:focus-visible+i{outline:2px solid var(--accent);outline-offset:2px}
.pm-state{margin:8px 4px 0;color:var(--ok);font-size:14px}
.pm-section{margin:24px 4px 8px;color:var(--accent);font-size:14px;font-weight:600}
.pm-empty{background:var(--surface);border-radius:12px;padding:20px 16px;color:var(--muted)}
.pm-empty p{margin:0 0 4px}
.pm-list{list-style:none;margin:0;padding:0;background:var(--surface);border-radius:12px;overflow:hidden}
.pm-list li{display:flex;align-items:center;border-bottom:1px solid var(--line)}
.pm-list li:last-child{border-bottom:0}
.pm-item{flex:1;display:flex;align-items:center;gap:14px;padding:12px 8px 12px 16px;text-align:left;min-width:0}
.pm-radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--muted);flex:none;position:relative}
.is-active .pm-radio{border-color:var(--accent)}
.is-active .pm-radio::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--accent)}
.pm-main{display:flex;flex-direction:column;min-width:0}
.pm-main b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pm-main small{color:var(--muted);font-size:13px}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.pm-actions{display:flex;padding-right:4px}
.pm-icon{padding:10px 8px;color:var(--muted);border-radius:8px}.pm-icon:hover{color:var(--accent)}
.pm-bar{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(440px,100%);display:flex;gap:10px;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--bg)}
.pm-bar button{flex:1}
.pm-primary,.pm-secondary{padding:13px 12px;border-radius:12px;font-weight:600;text-align:center;text-decoration:none;display:inline-block}
.pm-primary{background:var(--accent);color:#fff!important}
.pm-secondary{background:var(--surface)}
.pm-wide{width:100%;margin-bottom:12px}
.pm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;z-index:10}
.pm-sheet{width:min(440px,100%);max-height:92vh;overflow:auto;background:var(--bg);color:var(--text);border-radius:16px 16px 0 0;
  padding:20px 16px calc(24px + env(safe-area-inset-bottom))}
.pm-sheet h2{margin:0 0 14px;font-size:18px}
.pm-seg{display:flex;background:var(--surface);border-radius:10px;padding:3px;margin:0 0 14px}
.pm-seg button{flex:1;padding:8px;border-radius:8px;color:var(--muted)}
.pm-seg button[aria-selected="true"]{background:var(--bg);color:var(--text);font-weight:600}
.pm-field{display:block;font-size:13px;color:var(--muted);margin-bottom:12px}
.pm-field input{display:block;width:100%;margin-top:4px;padding:12px;border:1px solid var(--line);border-radius:10px;
  background:var(--surface);color:var(--text);font:inherit}
.pm-hint{margin:6px 0 0;color:var(--muted);font-size:14px}
.pm-center{text-align:center}
.pm-error{color:var(--bad);font-size:14px;margin:0 0 8px}
.pm-sheet-actions{display:flex;gap:10px;margin-top:12px}
.pm-sheet-actions>*{flex:1}
.pm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.pm-grid>*{font-size:14px}
.is-disabled{pointer-events:none;opacity:.5}
.pm-qr{display:grid;place-items:center;background:#fff;border-radius:14px;padding:10px;aspect-ratio:1;color:#555}
.pm-qr img{width:100%;height:100%;image-rendering:pixelated}
.pm-scan{position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:1}
.pm-scan video{width:100%;height:100%;object-fit:cover}
.pm-frame{position:absolute;inset:18%;border:3px solid #fff;border-radius:14px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}
.pm-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--text);color:var(--bg);
  padding:10px 16px;border-radius:20px;font-size:14px;z-index:20;max-width:90vw}
@media (prefers-reduced-motion:reduce){.pm *{transition:none!important}}
`;
