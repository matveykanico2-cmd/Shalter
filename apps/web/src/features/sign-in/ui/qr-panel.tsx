import { useCallback, useEffect, useState } from "react";

import { prettyQrSvg } from "@/shared/lib/qr/pretty-qr";
import { Button } from "@/shared/ui";

import { pollQrLogin, type SignedInUser, startQrLogin } from "../api/sign-in";

import styles from "./sign-in.module.css";

const QR_POLL_MS = 1500;

type Props = {
  onSignedIn: (user: SignedInUser) => void;
  onBack: () => void;
};

/**
 * Вход по QR-коду (renderQrPanel в public/js/views/login.js): код ведёт на /qr-login на телефоне,
 * где аккаунт уже открыт; здесь опрашиваем сервер, пока там не подтвердят. Истёк — новый код.
 */
export function QrPanel({ onSignedIn, onBack }: Props) {
  const [qr, setQr] = useState<{ token: string; svg: string } | "loading" | "error">("loading");

  // Состояние меняется только по ответу сервера; «загрузка» ставит тот, кто просит новый код.
  const fetchCode = useCallback(() => {
    startQrLogin().then(
      (res) => setQr({ token: res.token, svg: prettyQrSvg(res.loginUrl) }),
      () => setQr("error")
    );
  }, []);
  const start = () => {
    setQr("loading");
    fetchCode();
  };

  useEffect(fetchCode, [fetchCode]);

  const token = typeof qr === "object" ? qr.token : null;
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      pollQrLogin(token).then(
        (poll) => {
          if (poll.status === "confirmed") {
            clearInterval(timer);
            onSignedIn(poll.user);
          } else if (poll.status === "expired") {
            clearInterval(timer);
            setQr("loading");
            fetchCode();
          }
        },
        // Сбой сети — просто спросим ещё раз на следующем шаге.
        () => {}
      );
    }, QR_POLL_MS);
    return () => clearInterval(timer);
  }, [token, onSignedIn, fetchCode]);

  return (
    <div className={styles.panel}>
      <p className={styles.title}>Вход по QR-коду</p>
      {qr === "loading" ? (
        <div className={styles.qrSpinner} />
      ) : qr === "error" ? (
        <>
          <p className={`${styles.error} ${styles.center}`}>Не удалось получить код</p>
          <Button className={styles.submit} onClick={start}>
            Попробовать снова
          </Button>
        </>
      ) : (
        <>
          {/* SVG собран из постоянных путей и QR-матрицы, данных пользователя в нём нет. */}
          <div className={styles.qrCode} role="img" aria-label="QR-код для входа" dangerouslySetInnerHTML={{ __html: qr.svg }} />
          <p className={styles.instructions}>
            Откройте камеру на телефоне и наведите на код — откроется страница подтверждения. Если вы уже вошли в Shalter на телефоне,
            останется просто нажать «Подтвердить».
          </p>
        </>
      )}
      <button type="button" className={styles.link} onClick={onBack}>
        Войти по email
      </button>
    </div>
  );
}
