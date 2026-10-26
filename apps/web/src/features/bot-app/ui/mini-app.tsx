import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { errorText } from "@/shared/lib/error-text";
import { Button, Icon, Menu } from "@/shared/ui";

import { openBotApp, sendBotAppData } from "../api/bot-app";

import styles from "./bot-app.module.css";

const BRIDGE_VERSION = 1;

export type MiniAppTarget = { botId: string; botName?: string | null; chatId?: string | null; url?: string | null; appName?: string | null };

type MainButton = { text: string; visible: boolean; disabled: boolean; loading: boolean };
type BridgeMessage = { source?: unknown; method?: unknown; id?: unknown; payload?: Record<string, unknown> };

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function stripInitData(full: string) {
  try {
    const u = new URL(full);
    u.hash = "";
    return u.toString();
  } catch {
    return full;
  }
}

/**
 * Мини-приложение бота во фрейме — порт public/js/components/miniApp.js: мост postMessage
 * (ready, close, sendData, openLink, showAlert, showConfirm, mainButton) и главная кнопка внизу.
 */
export function MiniApp({ target, onClose }: { target: MiniAppTarget; onClose: () => void }) {
  const { botId, botName, chatId = null, url = null, appName = null } = target;
  const [session, setSession] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [mainButton, setMainButton] = useState<MainButton>({ text: "", visible: false, disabled: false, loading: false });
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const appOrigin = session ? new URL(session.url).origin : null;

  useEffect(() => {
    let cancelled = false;
    openBotApp(botId, { url, chatId, theme: currentTheme() }).then(
      (s) => !cancelled && setSession(s),
      (err: unknown) => !cancelled && setError(errorText(err, "Не удалось открыть приложение"))
    );
    return () => {
      cancelled = true;
    };
  }, [botId, url, chatId, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Мост с приложением: только сообщения из нашего фрейма и с меткой shalter-web-app.
  const post = (message: Record<string, unknown>) => {
    const win = frame.current?.contentWindow;
    if (!win || !appOrigin) return;
    win.postMessage({ source: "shalter", v: BRIDGE_VERSION, ...message }, appOrigin === window.location.origin ? "*" : appOrigin);
  };
  const postRef = useRef(post);
  useEffect(() => {
    postRef.current = post;
  });
  useEffect(() => {
    const reply = (id: unknown, ok: boolean, value: unknown) => {
      if (!id) return;
      postRef.current({ type: "result", id, ok, ...(ok ? { value } : { error: String(value ?? "error") }) });
    };
    const handlers: Record<string, (payload: Record<string, unknown>, id: unknown) => void | Promise<void>> = {
      ready: () => setLoaded(true),
      close: () => onClose(),
      sendData: async ({ data }, id) => {
        try {
          const text = String(data ?? "");
          if (!text.trim()) throw new Error("Пустые данные");
          await sendBotAppData(botId, text);
          reply(id, true, { ok: true });
          onClose();
        } catch (err) {
          reply(id, false, errorText(err, "Не удалось отправить"));
        }
      },
      openLink: ({ url: link }, id) => {
        try {
          const u = new URL(String(link));
          if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Только http(s)");
          window.open(u.toString(), "_blank", "noreferrer");
          reply(id, true, { ok: true });
        } catch (err) {
          reply(id, false, errorText(err, "Некорректная ссылка"));
        }
      },
      showAlert: ({ message }, id) => {
        window.alert(String(message ?? "").slice(0, 500));
        reply(id, true, { ok: true });
      },
      showConfirm: ({ message }, id) => {
        reply(id, true, { confirmed: window.confirm(String(message ?? "").slice(0, 500)) });
      },
      mainButton: (payload) =>
        setMainButton((b) => ({
          text: String(payload?.text ?? b.text).slice(0, 64),
          visible: payload?.visible !== false,
          disabled: !!payload?.disabled,
          loading: !!payload?.loading,
        })),
    };
    const onMessage = (e: MessageEvent<BridgeMessage>) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = e.data;
      if (!msg || msg.source !== "shalter-web-app" || typeof msg.method !== "string") return;
      const handler = handlers[msg.method];
      if (!handler) return reply(msg.id, false, `Неизвестный метод ${msg.method}`);
      Promise.resolve(handler(msg.payload ?? {}, msg.id)).catch((err: unknown) => reply(msg.id, false, errorText(err, "error")));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [botId, onClose]);

  const retry = () => {
    setError(null);
    setSession(null);
    setLoaded(false);
    setAttempt((n) => n + 1);
  };
  const hosted = appOrigin === window.location.origin;

  const title = appName || session?.name || botName || "Приложение";

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.header}>
        <button type="button" className={styles.iconButton} title="Закрыть" onClick={onClose}>
          <Icon name="X" size={18} />
        </button>
        <div className={styles.titles}>
          <p className={styles.title}>{title}</p>
          {botName ? <p className={styles.subtitle}>бот {botName}</p> : null}
        </div>
        <button type="button" className={styles.iconButton} title="Ещё" onClick={(e) => setMenuAt({ x: e.clientX, y: e.clientY })}>
          <Icon name="More" size={18} />
        </button>
      </div>
      <div className={styles.frameSlot}>
        {session ? (
          <iframe
            key={frameKey}
            ref={frame}
            className={styles.frame}
            src={session.url}
            title={title}
            sandbox={hosted ? "allow-scripts allow-forms allow-popups allow-modals" : "allow-scripts allow-same-origin allow-forms allow-popups allow-modals"}
            onLoad={() => setLoaded(true)}
          />
        ) : null}
        {error ? (
          <div className={styles.message}>
            <p className={styles.error}>{error}</p>
            <Button variant="secondary" onClick={retry}>
              Попробовать снова
            </Button>
          </div>
        ) : !loaded ? (
          <div className={styles.message}>
            <p className={styles.muted}>Открываем приложение…</p>
          </div>
        ) : null}
      </div>
      {mainButton.visible && mainButton.text ? (
        <button
          type="button"
          className={styles.mainButton}
          disabled={mainButton.disabled || mainButton.loading}
          onClick={() => post({ type: "event", event: "mainButtonClicked" })}
        >
          {mainButton.loading ? "…" : mainButton.text}
        </button>
      ) : null}
      {menuAt ? (
        <Menu
          at={menuAt}
          items={[
            {
              icon: "Download",
              label: "Перезагрузить",
              onClick: () => {
                setLoaded(false);
                setFrameKey((k) => k + 1);
              },
            },
            { icon: "Globe", label: "Открыть в браузере", onClick: () => session && window.open(stripInitData(session.url), "_blank", "noreferrer") },
          ]}
          onClose={() => setMenuAt(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}
