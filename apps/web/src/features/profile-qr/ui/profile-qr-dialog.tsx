import { useEffect, useMemo, useRef, useState } from "react";

import { ChatPickerDialog } from "@/entities/chat";

import { type Uploaded, uploadFile } from "@/shared/api";
import { publicUrl } from "@/shared/lib/public-link";
import { prettyQrSvg } from "@/shared/lib/qr/pretty-qr";
import { qrCardPng, type QrTheme } from "@/shared/lib/qr/qr-card";
import { Avatar, Button, Dialog, Icon } from "@/shared/ui";

import { sendQrToChat } from "../api/profile-qr";
import { shareFileNative } from "../lib/share-file";

import styles from "./profile-qr.module.css";

// Темы как в tweb (popups/myQrCode): фон-градиент, код и имя — цветом темы.
// Цвета градиента по отдельности нужны картинке для «Поделиться».
const QR_THEMES: QrTheme[] = [
  { id: "blue", bg: "linear-gradient(135deg, #8fd0ff, #5b8cff 55%, #7c6cf0)", ink: "#2f5bd8", from: "#8fd0ff", via: "#5b8cff", to: "#7c6cf0" },
  { id: "violet", bg: "linear-gradient(135deg, #d7a6ff, #9b6cf5 55%, #6b5ce7)", ink: "#6a3fd1", from: "#d7a6ff", via: "#9b6cf5", to: "#6b5ce7" },
  { id: "pink", bg: "linear-gradient(135deg, #ffc1d9, #f57aa6 55%, #c85ce0)", ink: "#c0397a", from: "#ffc1d9", via: "#f57aa6", to: "#c85ce0" },
  { id: "orange", bg: "linear-gradient(135deg, #ffe08a, #ffad5c 55%, #f0735a)", ink: "#d5602b", from: "#ffe08a", via: "#ffad5c", to: "#f0735a" },
  { id: "green", bg: "linear-gradient(135deg, #c8f2a0, #6fd08c 55%, #33a9a0)", ink: "#23886f", from: "#c8f2a0", via: "#6fd08c", to: "#33a9a0" },
  { id: "night", bg: "linear-gradient(135deg, #3b4a6b, #23304d 55%, #151c2f)", ink: "#23304d", from: "#3b4a6b", via: "#23304d", to: "#151c2f" },
];
const THEME_KEY = "shalter.qrTheme";

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "blue";
  } catch {
    return "blue";
  }
}

export type QrOwner = { name: string; username: string | null; avatarImage?: string | null; avatarColor?: string | null };

/** «QR-код» профиля — как public/js/components/profileQrDialog.js. */
export function ProfileQrDialog({ user, onClose }: { user: QrOwner; onClose: () => void }) {
  const url = publicUrl(`/u/${String(user.username ?? "").replace(/^@/, "")}`);
  const [themeId, setThemeId] = useState(savedTheme);
  const theme = QR_THEMES.find((t) => t.id === themeId) ?? QR_THEMES[0]!;
  const [note, setNote] = useState("");
  // Отправок может идти несколько сразу (выбрали несколько чатов) — считаем, а не флаг.
  const [sending, setSending] = useState(0);
  const [picking, setPicking] = useState(false);
  const svg = useMemo(() => prettyQrSvg(url, { color: theme.ink }), [url, theme.ink]);

  // Картинку готовим заранее: Safari открывает системное «Поделиться» только сразу
  // после нажатия, а рисование карточки занимало это время — и ничего не происходило.
  const card = useRef<Promise<File> | null>(null);
  const preparedCard = () => {
    card.current ??= qrCardPng({ url, name: user.name, username: user.username, theme, avatarImage: user.avatarImage, avatarColor: user.avatarColor, hint: "Отсканируйте, чтобы открыть профиль" })
      .then((blob) => new File([blob], `shalter-${user.username || "qr"}.png`, { type: "image/png" }))
      .catch((err: unknown) => {
        card.current = null;
        throw err;
      });
    return card.current;
  };
  useEffect(() => {
    card.current = null;
    // В jsdom и старых браузерах canvas нет — тогда картинку просто не готовим заранее.
    const t = setTimeout(() => void preparedCard().catch(() => {}), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- новая тема — новая картинка
  }, [themeId]);

  const pickTheme = (id: string) => {
    setThemeId(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* без сохранения — тема только на этот раз */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Ссылка скопирована ✓");
    } catch {
      setNote("Не удалось скопировать — выделите вручную");
    }
  };

  // Картинку загружаем один раз — даже если отправляем сразу многим.
  const uploaded = useRef<Promise<Uploaded> | null>(null);
  const sent = useRef(0);
  const sendTo = async (chatId: string) => {
    setSending((n) => n + 1);
    setNote("Отправляем…");
    uploaded.current ??= preparedCard()
      .then((file) => uploadFile(file, "image"))
      .catch((err: unknown) => {
        uploaded.current = null;
        throw err;
      });
    try {
      await sendQrToChat(chatId, url, await uploaded.current);
      sent.current += 1;
      setNote(sent.current > 1 ? `QR-код отправлен в ${sent.current} чатов ✓` : "QR-код отправлен ✓");
    } catch {
      setNote("Не удалось отправить QR-код");
    } finally {
      setSending((n) => n - 1);
    }
  };

  const shareImage = async () => {
    setNote("Готовим картинку…");
    try {
      const file = await preparedCard();
      if (await shareFileNative(file, file.name, `${user.name} — Shalter ${url}`)) {
        setNote("");
        return;
      }
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: user.name, text: `${user.name} — Shalter` });
        setNote("Картинка отправлена ✓");
        return;
      }
      const href = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setNote("Картинка сохранена ✓");
    } catch (err) {
      const e = err as { name?: string; message?: string } | null;
      setNote(e?.name === "AbortError" || /cancel/i.test(e?.message ?? "") ? "" : "Не удалось поделиться картинкой");
    }
  };

  const downloadCard = async () => {
    setNote("Готовим картинку…");
    try {
      const file = await preparedCard();
      const href = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setNote("Картинка скачана ✓");
    } catch {
      setNote("Не удалось скачать картинку");
    }
  };

  return (
    <>
      <Dialog title="QR-код" onClose={onClose} className={styles.dialog}>
        <button type="button" className={styles.close} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
          <Icon name="X" size={18} />
        </button>
        <div className={styles.stage} style={{ background: theme.bg }}>
          <div className={styles.card}>
            <span className={styles.avatar}>
              <Avatar size={64} name={user.name} color={user.avatarColor} image={user.avatarImage} />
            </span>
            {/* Разметка кода — из своего же генератора, без пользовательского HTML. */}
            <div className={styles.code} role="img" aria-label="QR-код" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className={styles.username} style={{ color: theme.ink }}>
              @{user.username}
            </p>
          </div>
        </div>
        <div className={styles.themes}>
          {QR_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === themeId ? `${styles.theme} ${styles.active}` : styles.theme}
              style={{ background: t.bg }}
              title="Тема"
              aria-pressed={t.id === themeId}
              onClick={() => pickTheme(t.id)}
            />
          ))}
        </div>
        <div className={styles.actions}>
          <Button onClick={() => void copy()}>
            <Icon name="Copy" size={16} />
            Скопировать ссылку
          </Button>
          <Button variant="secondary" onClick={() => void shareImage()}>
            <Icon name="Share" size={16} />
            Поделиться
          </Button>
          <Button variant="secondary" onClick={() => void downloadCard()}>
            <Icon name="Download" size={16} />
            Скачать картинку
          </Button>
          <Button variant="secondary" onClick={() => setPicking(true)}>
            <Icon name="Send" size={16} />
            Отправить в чат
          </Button>
        </div>
        <p className={styles.note} role="status">
          {/* Спиннер — отдельным узлом рядом с текстом, смена текста его не стирает. */}
          {sending > 0 ? <span className={styles.spinner} aria-hidden="true" data-testid="qr-send-spinner" /> : null}
          {note}
        </p>
      </Dialog>
      {picking ? <ChatPickerDialog title="Отправить QR-код" onSend={sendTo} onClose={() => setPicking(false)} /> : null}
    </>
  );
}
