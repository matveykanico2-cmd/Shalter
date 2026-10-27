import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, Icon } from "@/shared/ui";

import { type NearbyUser, shareNearbyLocation, stopNearbySharing } from "../api/nearby";

import styles from "./nearby-view.module.css";

/**
 * /nearby — «Люди рядом» (public/js/views/nearby.js): пока экран открыт и показ включён, каждое
 * изменение местоположения уходит на сервер, а в ответ приходит список тех, кто рядом.
 */
export function NearbyView() {
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const stopWatch = () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  };
  // Ушли с экрана — следить перестаём, но показ на сервере остаётся, как в старом клиенте.
  useEffect(() => stopWatch, []);

  const start = () => {
    if (!navigator.geolocation) return setError("Геолокация не поддерживается в этом браузере");
    setSharing(true);
    setError(null);
    const update = (pos: GeolocationPosition) =>
      void shareNearbyLocation(pos.coords.latitude, pos.coords.longitude).then(
        (res) => {
          if (watchId.current != null) setUsers(res.users);
        },
        (err) => setError(errorText(err, "Не удалось обновить местоположение"))
      );
    navigator.geolocation.getCurrentPosition(update, () => {
      stopWatch();
      setError("Не удалось получить местоположение");
      setSharing(false);
    });
    watchId.current = navigator.geolocation.watchPosition(update, () => {}, { maximumAge: 5 * 60_000, timeout: 20_000 });
  };

  const stop = async () => {
    stopWatch();
    await stopNearbySharing().catch(() => {});
    setSharing(false);
    setUsers([]);
  };

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <button type="button" className={styles.back} title="Назад" aria-label="Назад" onClick={() => void navigate("/contacts")}>
          <Icon name="ChevronLeft" size={22} />
        </button>
        <h2 className={styles.title}>Люди рядом</h2>
      </header>
      <div className={styles.body}>
        <p className={styles.hint}>Координаты огрубляются до примерно километра, а остальным видно только расстояние диапазоном — не точка на карте.</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {sharing ? (
          <Button variant="secondary" className={styles.stop} onClick={() => void stop()}>
            Перестать показывать меня
          </Button>
        ) : (
          <Button onClick={start}>Показать, кто рядом</Button>
        )}
        {sharing ? (
          users.length ? (
            <div className={styles.list}>
              {users.map((u) => (
                <div key={u.id} className={styles.row}>
                  <Avatar name={u.name} color={u.avatarColor} image={u.avatarImage} size={40} />
                  <div className={styles.rowBody}>
                    <p className={styles.name}>{u.name}</p>
                    <p className={styles.label}>{u.label}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Пока рядом никого не видно</p>
          )
        ) : null}
      </div>
    </div>
  );
}
