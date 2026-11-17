import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { pollQrLogin, startQrLogin } from "@/features/sign-in";

import { http } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { timeAgo } from "@/shared/lib/presence";
import { prettyQrSvg } from "@/shared/lib/qr/pretty-qr";
import { Button, Dialog, Icon, SettingsButton, SettingsPage, SettingsRow, SettingsSection, toast } from "@/shared/ui";

import { type DeviceSession, settingsViewQueries, terminateOtherSessions, terminateSession } from "../../api/settings-api";
import { sessionAppName, sessionPlatform } from "../../lib/sessions";

import styles from "./sections.module.css";

type Confirm = { title: string; text: string; run: () => Promise<unknown> };

/** «Устройства» — renderDevices: это устройство, активные сеансы, завершение. */
export function DevicesSection() {
  const client = useQueryClient();
  const key = settingsViewQueries.sessions().queryKey;
  const sessions = useQuery(settingsViewQueries.sessions()).data;
  const [opened, setOpened] = useState<DeviceSession | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [qrMode, setQrMode] = useState<"show" | "scan" | null>(null);

  if (!sessions) return null;
  const current = sessions.find((s) => s.current);
  const others = sessions.filter((s) => !s.current);
  const keep = (pred: (s: DeviceSession) => boolean) => client.setQueryData(key, (list) => list?.filter(pred));

  const terminate = (s: DeviceSession) =>
    setConfirm({
      title: "Завершить сеанс?",
      text: "Устройство будет разлогинено.",
      run: async () => {
        await terminateSession(s.deviceId);
        keep((x) => x.deviceId !== s.deviceId);
      },
    });
  const terminateOthers = () =>
    setConfirm({
      title: "Завершить сеансы?",
      text: "Все устройства, кроме этого, будут разлогинены.",
      run: async () => {
        await terminateOtherSessions();
        keep((x) => x.current);
      },
    });

  const row = (s: DeviceSession) => {
    const { app, system } = sessionAppName(s.device);
    const platform = sessionPlatform(s.device);
    return (
      <SettingsRow
        key={s.id}
        icon={platform.icon}
        color={platform.color}
        title={app}
        titleRight={s.current ? null : timeAgo(s.lastActive)}
        midtitle={system || "Shalter"}
        subtitle={s.current ? `${s.location || ""}${s.location ? " · " : ""}в сети` : s.location}
        onClick={() => setOpened(s)}
      />
    );
  };

  return (
    <SettingsPage>
      <div className={styles.mediaHeader}>
        <span className={styles.mediaSticker}>
          <Icon name="Monitor" size={56} />
        </span>
        <p className={styles.mediaSubtitle}>Здесь все устройства, на которых выполнен вход в ваш аккаунт Shalter.</p>
      </div>
      {current ? (
        <SettingsSection title="Это устройство" caption={others.length ? "Выйти на всех устройствах, кроме этого." : null}>
          {row(current)}
          {others.length ? (
            <SettingsButton icon="X" danger onClick={terminateOthers}>
              Завершить все другие сеансы
            </SettingsButton>
          ) : null}
        </SettingsSection>
      ) : null}
      <SettingsSection title="Вход по QR-коду" caption="Подключите новое устройство через уже вошедшее устройство.">
        <SettingsButton icon="Qrcode" onClick={() => setQrMode("show")}>
          Показать QR для нового устройства
        </SettingsButton>
        <SettingsButton icon="Camera" onClick={() => setQrMode("scan")}>
          Сканировать QR-код входа
        </SettingsButton>
      </SettingsSection>
      {others.length ? (
        <SettingsSection title="Активные сеансы" caption="Нажмите на сеанс, чтобы посмотреть подробности или завершить его.">
          {others.map(row)}
        </SettingsSection>
      ) : null}
      {opened ? (
        <SessionPopup
          session={opened}
          onClose={() => setOpened(null)}
          onTerminate={
            opened.current
              ? undefined
              : () => {
                  setOpened(null);
                  terminate(opened);
                }
          }
        />
      ) : null}
      {confirm ? <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} /> : null}
      {qrMode ? <QrDeviceDialog mode={qrMode} onClose={() => setQrMode(null)} /> : null}
    </SettingsPage>
  );
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type DetectorWindow = Window & { BarcodeDetector?: new (options?: { formats: string[] }) => Detector };

function tokenFromQr(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.searchParams.get("token") || (url.pathname === "/qr-login" ? null : value.trim());
  } catch {
    return value.trim();
  }
}

function QrDeviceDialog({ mode, onClose }: { mode: "show" | "scan"; onClose: () => void }) {
  const [login, setLogin] = useState<{ token: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (mode !== "show") return;
    let cancelled = false;
    startQrLogin().then((result) => {
      if (!cancelled) setLogin({ token: result.token, url: result.loginUrl });
    }).catch(() => setError("Не удалось создать QR-код"));
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (mode !== "show" || !login) return;
    const timer = window.setInterval(() => {
      void pollQrLogin(login.token).then((result) => {
        if (result.status === "confirmed") {
          toast("Новое устройство подключено");
          onClose();
        } else if (result.status === "expired") {
          setLogin(null);
          setError("QR-код устарел, создайте новый");
        }
      }).catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [login, mode, onClose]);

  useEffect(() => {
    if (mode !== "scan") return;
    let cancelled = false;
    const startCamera = async () => {
      const DetectorClass = (window as DetectorWindow).BarcodeDetector;
      if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
        setError("Сканер QR не поддерживается этим браузером. Введите токен вручную.");
        return;
      }
      try {
        const currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) return currentStream.getTracks().forEach((track) => track.stop());
        stream.current = currentStream;
        if (!video.current) return;
        video.current.srcObject = currentStream;
        await video.current.play();
        const detector = new DetectorClass({ formats: ["qr_code"] });
        const scan = async () => {
          if (cancelled || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const token = found.map((item) => tokenFromQr(item.rawValue || "")).find(Boolean);
            if (token) {
              setManual(token);
              setError("QR-код найден. Нажмите «Подтвердить вход», если это ваше устройство.");
              stream.current?.getTracks().forEach((track) => track.stop());
              return;
            }
          } catch {
            // Камера может временно не успеть декодировать кадр.
          }
          window.setTimeout(() => void scan(), 250);
        };
        void scan();
      } catch {
        setError("Не удалось открыть камеру. Проверьте разрешение камеры.");
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [mode, onClose]);

  const confirmManual = async () => {
    const token = tokenFromQr(manual);
    if (!token) return;
    setBusy(true);
    try {
      await http.post<{ ok: true }>("/api/auth/qr/confirm", { token });
      toast("Вход подтверждён на новом устройстве");
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось подтвердить вход"));
      setBusy(false);
    }
  };

  return (
    <Dialog title={mode === "show" ? "Вход на новом устройстве" : "Сканировать QR-код"} onClose={onClose}>
      {mode === "show" ? (
        login ? (
          <>
            <p className={styles.dialogText}>Наведите камеру нового устройства на этот код. После сканирования подтвердите вход на этом устройстве.</p>
            <div className={styles.qrLoginCode} role="img" aria-label="QR-код для входа" dangerouslySetInnerHTML={{ __html: prettyQrSvg(login.url) }} />
            <Button variant="secondary" onClick={() => { setLogin(null); setError(null); startQrLogin().then((r) => setLogin({ token: r.token, url: r.loginUrl })).catch(() => setError("Не удалось создать QR-код")); }}>Обновить QR-код</Button>
          </>
        ) : <p className={styles.dialogText}>{error || "Создаём безопасный QR-код…"}</p>
      ) : (
        <>
          <video ref={video} className={styles.qrScanner} muted playsInline aria-label="Камера для сканирования QR-кода" />
          <p className={styles.dialogText}>{error || "Наведите камеру на QR-код входа."}</p>
          <input className={styles.qrTokenInput} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Или вставьте ссылку/токен" aria-label="Токен QR-кода" />
          <Button disabled={busy || !manual.trim()} onClick={() => void confirmManual()}>Подтвердить вход</Button>
        </>
      )}
    </Dialog>
  );
}

/** Подробности сеанса — openSessionPopup. */
function SessionPopup({ session, onClose, onTerminate }: { session: DeviceSession; onClose: () => void; onTerminate?: () => void }) {
  const { app, system } = sessionAppName(session.device);
  const platform = sessionPlatform(session.device);
  return (
    <Dialog title={app} onClose={onClose} className={styles.sessionPopup}>
      <button type="button" className={styles.popupClose} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
        <Icon name="X" size={22} />
      </button>
      <div className={styles.sessionHero}>
        <span className={styles.sessionHeroIcon} data-color={platform.color}>
          <Icon name={platform.icon} size={48} />
        </span>
        <p className={styles.mediaSubtitle}>{session.current ? "в сети" : timeAgo(session.lastActive)}</p>
      </div>
      <SettingsSection title="Информация" caption={session.location ? "Местоположение определено по IP-адресу и может быть неточным." : null}>
        <SettingsRow title="Приложение" right={app} />
        <SettingsRow title="Система" right={system || "—"} />
        <SettingsRow title="Местоположение" right={session.location || "—"} />
      </SettingsSection>
      {onTerminate ? (
        <SettingsSection>
          <SettingsButton icon="X" danger onClick={onTerminate}>
            Завершить сеанс
          </SettingsButton>
        </SettingsSection>
      ) : null}
    </Dialog>
  );
}

/** Подтверждение с пояснением — openCheckboxDialog без галочки. */
function ConfirmDialog({ title, text, run, onClose }: Confirm & { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const ok = async () => {
    setBusy(true);
    try {
      await run();
      onClose();
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось завершить сеанс"), { error: true });
    }
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <p className={styles.dialogText}>{text}</p>
      <Button variant="danger" disabled={busy} onClick={() => void ok()}>
        Завершить
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
