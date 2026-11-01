import { useMemo } from "react";

import { copyText } from "@/shared/lib/clipboard";
import { prettyQrSvg } from "@/shared/lib/qr/pretty-qr";
import { Button, Dialog, openExternally } from "@/shared/ui";

import { proxyDeepLink,type ProxyLink } from "../lib/proxy-link";

import styles from "./proxy.module.css";

/** QR-код ссылки прокси: камера телефона откроет его в браузере. */
export function ProxyQr({ link }: { link: string }) {
  const svg = useMemo(() => prettyQrSvg(link), [link]);
  return <div className={styles.qr} role="img" aria-label={`QR-код прокси ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** «Поделиться прокси»: QR, ссылка для браузера и ссылка для приложения. */
export function ProxyShareDialog({ proxy, onClose }: { proxy: ProxyLink; onClose: () => void }) {
  const canShare = typeof navigator.share === "function";
  return (
    <Dialog title="Поделиться прокси" onClose={onClose}>
      <ProxyQr link={proxy.link} />
      <p className={styles.link}>{proxy.link}</p>
      <p className={styles.hint}>
        Отсканируйте код или откройте ссылку в браузере — Shalter загрузится через этот прокси.
        {proxy.secret ? " Без ссылки с секретом прокси для других выглядит как пустой сайт." : ""}
      </p>
      <div className={styles.dialogButtons}>
        <Button onClick={() => void copyText(proxy.link, "Ссылка скопирована")}>Скопировать ссылку</Button>
        {canShare ? (
          <Button variant="secondary" onClick={() => void navigator.share({ title: "Прокси Shalter", url: proxy.link }).catch(() => {})}>
            Отправить…
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => void copyText(proxyDeepLink(proxy.link), "Ссылка для приложения скопирована")}>
          Ссылка для приложения
        </Button>
        <Button variant="link" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}

type DesktopWindow = Window & { shalterDesktop?: unknown; __TAURI_INTERNALS__?: unknown };

/**
 * «Подключиться» в установленном приложении: адрес сервера у оболочек задан снаружи
 * (Capacitor — при сборке, Tauri — параметром или server.json), страница его не меняет.
 */
export function NativeProxyDialog({ proxy, onClose }: { proxy: ProxyLink; onClose: () => void }) {
  const w = window as DesktopWindow;
  const desktop = !!(w.shalterDesktop || w.__TAURI_INTERNALS__);
  return (
    <Dialog title="Прокси в приложении" onClose={onClose}>
      {desktop ? (
        <p className={styles.hint}>
          Приложение для компьютера открывает сервер, заданный при запуске, и переключить его отсюда нельзя. Запустите Shalter с параметром{" "}
          <code>--server-url={proxy.link}</code> или впишите в файл <code>~/.config/shalter/server.json</code> строку{" "}
          <code>{JSON.stringify({ url: proxy.link })}</code> и перезапустите приложение. Или откройте прокси в браузере.
        </p>
      ) : (
        <p className={styles.hint}>
          Адрес сервера встроен в приложение, и переключить его отсюда нельзя. Откройте прокси в браузере — Shalter работает там целиком, а страницу можно добавить на главный
          экран.
        </p>
      )}
      <div className={styles.dialogButtons}>
        <Button onClick={() => void openExternally(proxy.link)}>Открыть в браузере</Button>
        <Button variant="secondary" onClick={() => void copyText(proxy.link, "Ссылка скопирована")}>
          Скопировать ссылку
        </Button>
        <Button variant="link" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Dialog>
  );
}
