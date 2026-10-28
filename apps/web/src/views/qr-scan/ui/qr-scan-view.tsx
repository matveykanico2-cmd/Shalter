import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { pollQrLogin,startQrLogin } from "@/features/sign-in";

import { useSession } from "@/entities/session";

import { http } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { prettyQrSvg } from "@/shared/lib/qr/pretty-qr";
import { qrCardPng } from "@/shared/lib/qr/qr-card";
import { Avatar, Button, Dialog, Icon, toast } from "@/shared/ui";

import styles from "./qr-scan.module.css";

const POLL_MS = 2000;

export function QrScanView() {
  const session = useSession();
  const me = session.data?.user ?? null;
  const navigate = useNavigate();
  const [ownToken, setOwnToken] = useState<string | null>(null);
  const [ownUrl, setOwnUrl] = useState<string | null>(null);
  const [entered, setEntered] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const start = useMutation({
    mutationFn: startQrLogin,
    onSuccess: (data: { token: string; loginUrl: string }) => {
      setOwnToken(data.token);
      setOwnUrl(data.loginUrl);
    },
    onError: (err) => toast(errorText(err, "Не удалось создать QR-код входа"), { error: true }),
  });

  const poll = useMutation({
    mutationFn: (token: string) => pollQrLogin(token),
    onSuccess: (data: { status: string }) => {
      if (data.status === "confirmed") {
        toast("Вход подтверждён");
        navigate("/");
      } else if (data.status === "expired") {
        toast("QR-код устарел", { error: true });
      }
    },
    onError: (err) => toast(errorText(err, "Ошибка подтверждения входа"), { error: true }),
  });

  const confirm = useMutation({
    mutationFn: (token: string) => http.post<{ ok: true }>("/api/auth/qr/confirm", { token }),
    onSuccess: () => {
      toast("Вход подтверждён на этом устройстве");
      navigate("/");
    },
    onError: (err) => toast(errorText(err, "Не удалось подтвердить вход"), { error: true }),
  });

  const startOwn = () => void start.mutate();
  const pollOwn = () => {
    if (!ownToken) return;
    void poll.mutate(ownToken);
    const id = setInterval(() => void poll.mutate(ownToken), POLL_MS);
    setTimeout(() => clearInterval(id), 90_000);
  };

  const handleEntered = async () => {
    const token = entered.trim() || (file ? await readQr(file) : "");
    if (!token) return setFile(null);
    setFile(null);
    setEntered("");
    void confirm.mutate(token);
  };

  const readQr = async (f: File): Promise<string> => {
    // Нативное чтение QR из картинки без посторонней библиотеки недоступно —
    // предлагаем ввести токен вручную или отсканировать камерой в приложении.
    const text = await f.text().catch(() => "");
    const m = text.match(/[0-9a-f]{40}/);
    return m ? m[0] : "";
  };

  const showQr = () => (ownToken ? <QrDialog url={ownUrl ?? ""} user={me ?? undefined} onClose={() => setOwnToken(null)} /> : null);

  return (
    <section className={styles.panel} aria-label="Вход по QR-коду">
      <header className={styles.header}>
        <button type="button" className={styles.back} title="Назад" aria-label="Назад" onClick={() => navigate(-1)}>
          <Icon name="ChevronLeft" size={22} />
        </button>
        <h2 className={styles.title}>Вход по QR-коду</h2>
      </header>
      <div className={styles.content}>
        <section className={styles.card}>
          <p className={styles.cardTitle}>Ваш QR-код для входа на другом устройстве</p>
          <p className={styles.cardSub}>
            Покажите этот код другой камере Shalter — она откроет вход и попросит подтвердить его здесь.
          </p>
          <div className={styles.actions}>
            <Button disabled={start.isPending} onClick={startOwn}>
              {start.isPending ? "Создаём…" : "Показать QR-код входа"}
            </Button>
            {ownToken && (
              <Button variant="secondary" onClick={pollOwn} title="Проверить, подтверждён ли вход">
                <Icon name="RotateCw" size={16} />
                Проверить вход
              </Button>
            )}
          </div>
          {ownToken && (
            <div className={styles.qrCode} role="img" aria-label="QR-код входа" dangerouslySetInnerHTML={{ __html: prettyQrSvg(ownUrl ?? "") }} />
          )}
          {showQr()}
        </section>
        <section className={styles.card}>
          <p className={styles.cardTitle}>Отсканировать чужой QR-код</p>
          <p className={styles.cardSub}>
            Загрузите картинку с кодом или введите токен вручную — устройство предложит подтвердить вход.
          </p>
          <input
            className={styles.tokenInput}
            placeholder="Токен из QR-кода"
            value={entered}
            onChange={(e) => setEntered(e.target.value)}
            maxLength={40}
          />
          <div className={styles.actions}>
            <input
              accept="image/*"
              className={styles.fileInput}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) void handleEntered();
                e.target.value = "";
              }}
              type="file"
            />
            <Button onClick={() => document.querySelector<HTMLInputElement>('[type="file"]')?.click()}>
              <Icon name="Image" size={16} />
              Картинка с кодом
            </Button>
            <Button onClick={() => void handleEntered()} disabled={!entered && !file}>
              Подтвердить вход
            </Button>
          </div>
          {file && <p className={styles.hint}>Файл выбран — нажмите «Подтвердить вход».</p>}
        </section>
      </div>
    </section>
  );
}

function QrDialog({ url, user, onClose }: { url: string; user?: { name: string; avatarColor?: string; avatarImage?: string | null }; onClose: () => void }) {
  const [card, setCard] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      if (!card) {
        const blob = await qrCardPng({
          url,
          name: user?.name ?? "",
          username: null,
          theme: { id: "blue", bg: "", ink: "#2f5bd8", from: "#8fd0ff", via: "#5b8cff", to: "#7c6cf0" },
          avatarImage: user?.avatarImage ?? null,
          avatarColor: user?.avatarColor ?? null,
          hint: "Отсканируйте, чтобы войти в Shalter",
        });
        setCard(new File([blob], "shalter-qr-login.png", { type: "image/png" }));
      }
      if (navigator.canShare?.({ files: [card!] })) {
        await navigator.share({ files: [card!], title: "Вход в Shalter", text: "Отсканируйте QR-код, чтобы войти" });
      } else {
        const href = URL.createObjectURL(card!);
        const a = document.createElement("a");
        a.href = href;
        a.download = card!.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      }
    } catch {
      // Отмена — не ошибка.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="QR-код входа" onClose={onClose} className={styles.qrDialog}>
      <button type="button" className={styles.close} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
        <Icon name="X" size={18} />
      </button>
      <div className={styles.qrStage}>
        <div className={styles.qrCard}>
          <span className={styles.qrAvatar}>
            <Avatar size={64} name={user?.name ?? ""} color={user?.avatarColor} image={user?.avatarImage} />
          </span>
          <div className={styles.qrCode} role="img" aria-label="QR-код входа" dangerouslySetInnerHTML={{ __html: prettyQrSvg(url) }} />
          <p className={styles.qrHint}>Отсканируйте на другом устройстве</p>
        </div>
      </div>
      <div className={styles.qrActions}>
        <Button onClick={() => void share()} disabled={busy}>
          {busy ? "Готовим…" : <><Icon name="Share" size={16} /> Поделиться</>}
        </Button>
      </div>
    </Dialog>
  );
}
