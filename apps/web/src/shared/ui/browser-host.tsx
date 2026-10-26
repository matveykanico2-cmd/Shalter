import type { instantViewBody, linkCheckBody } from "@shalter/shared/schemas/integrations";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { z } from "zod";

import { http } from "../api";
import { errorText } from "../lib/error-text";
import { embedUrlFor, hostOf, isEmbedPlayer } from "../lib/link-safety";

import styles from "./browser.module.css";
import { type BrowserPage, browserStore, openExternally, openInAppBrowser } from "./browser-store";
import { Button } from "./button";
import { Icon } from "./icon";

type InstantView = z.infer<typeof instantViewBody>["view"];

/** Окно встроенного браузера или Instant View; ставится один раз в оболочке приложения. */
export function BrowserHost() {
  const page = useSyncExternalStore(browserStore.subscribe, browserStore.get);
  if (!page) return null;
  const close = () => browserStore.close(page.id);
  return createPortal(page.kind === "browser" ? <InAppBrowser key={page.id} page={page} onClose={close} /> : <InstantViewPanel key={page.id} page={page} onClose={close} />, document.body);
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

type Body = { kind: "loading" } | { kind: "frame" } | { kind: "blocked"; reason: string; tryHere: boolean };

const NOT_CHECKED = "Не удалось проверить, откроется ли сайт внутри приложения.";

/** Сайт во фрейме — только когда он точно это разрешает, иначе объяснение и «Открыть в браузере». */
function firstBody(target: string): Body {
  if (!URL.canParse(target)) return { kind: "blocked", reason: "Некорректная ссылка", tryHere: false };
  if (new URL(target).protocol === "http:" && window.location.protocol === "https:") {
    return { kind: "blocked", reason: "Сайт работает без шифрования (http), поэтому внутри приложения его открыть нельзя.", tryHere: false };
  }
  return isEmbedPlayer(target) ? { kind: "frame" } : { kind: "loading" };
}

function InAppBrowser({ page, onClose }: { page: BrowserPage; onClose: () => void }) {
  const { url, warning, unsafe } = page;
  const target = embedUrlFor(url);
  const [body, setBody] = useState<Body>(() => firstBody(target));
  useEscape(onClose);
  const checking = body.kind === "loading";
  useEffect(() => {
    if (!checking) return;
    const ctrl = new AbortController();
    http.get<z.infer<typeof linkCheckBody>>(`/api/link-check?url=${encodeURIComponent(target)}`, ctrl.signal).then(
      (res) =>
        setBody(
          res.frameable === true
            ? { kind: "frame" }
            : res.frameable === false
              ? { kind: "blocked", reason: "Этот сайт не разрешает открывать себя внутри других приложений.", tryHere: false }
              : { kind: "blocked", reason: NOT_CHECKED, tryHere: true }
        ),
      () => !ctrl.signal.aborted && setBody({ kind: "blocked", reason: NOT_CHECKED, tryHere: true })
    );
    return () => ctrl.abort();
  }, [checking, target]);
  const outside = () => {
    openExternally(url);
    onClose();
  };
  const host = hostOf(url);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={host}>
      <div className={styles.header}>
        <button type="button" className={styles.iconButton} title="Закрыть" onClick={onClose}>
          <Icon name="X" size={18} />
        </button>
        <div className={styles.host}>
          <Icon name="Lock" size={12} /> {host}
        </div>
        <button type="button" className={styles.external} title="Открыть в браузере" onClick={outside}>
          <Icon name="Globe" size={16} />
          <span>В браузере</span>
        </button>
      </div>
      {warning ? (
        <div className={unsafe ? `${styles.warning} ${styles.danger}` : styles.warning}>
          <Icon name="Info" size={14} /> {warning}
        </div>
      ) : null}
      <div className={styles.body}>
        {body.kind === "loading" ? <div className={styles.loading}>Загрузка…</div> : null}
        {body.kind === "frame" ? (
          <iframe
            className={styles.frame}
            src={target}
            title={host}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            referrerPolicy="no-referrer"
          />
        ) : null}
        {body.kind === "blocked" ? (
          <div className={styles.blocked}>
            <span className={styles.blockedIcon}>
              <Icon name="Globe" size={40} />
            </span>
            <p className={styles.blockedTitle}>{host}</p>
            <p className={styles.blockedText}>{body.reason}</p>
            <Button onClick={outside}>Открыть в браузере</Button>
            {body.tryHere ? (
              <Button variant="secondary" onClick={() => setBody({ kind: "frame" })}>
                Попробовать открыть здесь
              </Button>
            ) : null}
            <Button variant="link" onClick={() => void navigator.clipboard?.writeText(url).catch(() => {})}>
              Скопировать ссылку
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** Instant View (public/js/components/instantView.js): сервер отдаёт только текстовые блоки — никакого чужого HTML. */
function InstantViewPanel({ page, onClose }: { page: BrowserPage; onClose: () => void }) {
  const [state, setState] = useState<{ view: InstantView } | { error: string } | null>(null);
  useEscape(onClose);
  useEffect(() => {
    const ctrl = new AbortController();
    http.get<z.infer<typeof instantViewBody>>(`/api/link-check/instant-view?url=${encodeURIComponent(page.url)}`, ctrl.signal).then(
      ({ view }) => setState({ view }),
      (err: unknown) => !ctrl.signal.aborted && setState({ error: errorText(err, "Не удалось открыть статью") })
    );
    return () => ctrl.abort();
  }, [page.url]);
  const site = () => {
    onClose();
    openInAppBrowser(page.url, { unsafe: page.unsafe, warning: page.warning });
  };

  return (
    <div
      className={styles.ivOverlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.ivPanel} role="dialog" aria-modal="true" aria-label="Instant View">
        <div className={styles.header}>
          <button type="button" className={styles.iconButton} title="Закрыть" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
          <span className={styles.ivBadge}>⚡ Instant View</span>
          <button type="button" className={styles.external} onClick={site}>
            Открыть сайт
          </button>
        </div>
        <div className={styles.ivBody}>
          {!state ? <p className={styles.ivStatus}>Загружаем статью…</p> : null}
          {state && "error" in state ? (
            <>
              <p className={styles.ivStatus}>{state.error}</p>
              <Button onClick={site}>Открыть сайт</Button>
            </>
          ) : null}
          {state && "view" in state ? <Article view={state.view} /> : null}
        </div>
      </div>
    </div>
  );
}

function Article({ view }: { view: InstantView }) {
  const date = view.publishedAt && !Number.isNaN(Date.parse(view.publishedAt)) ? DATE.format(new Date(view.publishedAt)) : "";
  const byline = [view.author, date].filter(Boolean).join(" · ");
  return (
    <article>
      <p className={styles.ivSite}>{view.siteName}</p>
      <h2 className={styles.ivTitle}>{view.title || view.siteName}</h2>
      {byline ? <p className={styles.ivByline}>{byline}</p> : null}
      {view.blocks.map((b, i) => {
        if (b.type === "image") return <ArticleImage key={i} src={b.url} />;
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className={styles.ivHeading}>
                {b.text}
              </h3>
            );
          case "quote":
            return (
              <blockquote key={i} className={styles.ivQuote}>
                {b.text}
              </blockquote>
            );
          case "item":
            return <p key={i} className={styles.ivItem}>{`• ${b.text}`}</p>;
          case "code":
            return (
              <pre key={i} className={styles.ivCode}>
                {b.text}
              </pre>
            );
          case "caption":
            return (
              <p key={i} className={styles.ivCaption}>
                {b.text}
              </p>
            );
          default:
            return (
              <p key={i} className={styles.ivText}>
                {b.text}
              </p>
            );
        }
      })}
    </article>
  );
}

function ArticleImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return <img className={styles.ivImage} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}
