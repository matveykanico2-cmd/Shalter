import { useEffect, useRef, useState } from "react";

import { Button, Dialog } from "@/shared/ui";

import { drawMeme } from "../lib/meme";

import styles from "./drawing.module.css";

type Props = {
  /** Готовый мем — JPEG, уходит в чат картинкой. */
  onDone: (file: File) => void;
  onClose: () => void;
};

/** «Мем» — public/js/components/memeDialog.js: картинка, верхний и нижний текст, превью на canvas. */
export function MemeDialog({ onDone, onClose }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [top, setTop] = useState("");
  const [bottom, setBottom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  // Превью — раз в кадр, не на каждую букву.
  useEffect(() => {
    if (!image || !canvas.current) return;
    const frame = requestAnimationFrame(() => {
      if (canvas.current) drawMeme(canvas.current, image, top, bottom);
    });
    return () => cancelAnimationFrame(frame);
  }, [image, top, bottom]);

  const pick = (file: File) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    const img = new Image();
    img.onload = () => {
      if (objectUrl.current !== url) return;
      setError(null);
      setImage(img);
    };
    img.onerror = () => {
      if (objectUrl.current !== url) return;
      setImage(null);
      setError("Не удалось открыть картинку");
    };
    img.src = url;
  };

  const send = async () => {
    if (busy || !image || !canvas.current) return;
    setBusy(true);
    setError(null);
    try {
      drawMeme(canvas.current, image, top, bottom);
      const blob = await new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, "image/jpeg", 0.9) ?? resolve(null));
      if (!blob) throw new Error("Не удалось создать картинку");
      onClose();
      onDone(new File([blob], "meme.jpg", { type: "image/jpeg" }));
    } catch (err) {
      setError((err instanceof Error && err.message) || "Не удалось создать мем");
      setBusy(false);
    }
  };

  const ready = !!image?.naturalWidth;
  return (
    <Dialog title="Мем" onClose={onClose} className={styles.memeDialog}>
      <Button variant="secondary" onClick={() => fileInput.current?.click()}>
        {ready ? "Выбрать другую картинку" : "Выбрать картинку"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="meme-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) pick(file);
        }}
      />
      {ready ? (
        <>
          <div className={styles.memePreview}>
            <canvas ref={canvas} className={styles.memeCanvas} aria-label="Превью мема" />
          </div>
          <input
            className={styles.input}
            placeholder="Верхний текст"
            aria-label="Верхний текст"
            maxLength={200}
            autoFocus
            value={top}
            onChange={(e) => setTop(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                bottomInput.current?.focus();
              }
            }}
          />
          <input
            ref={bottomInput}
            className={styles.input}
            placeholder="Нижний текст"
            aria-label="Нижний текст"
            maxLength={200}
            value={bottom}
            onChange={(e) => setBottom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {ready ? (
        <Button disabled={busy} onClick={() => void send()}>
          {busy ? "Готовим…" : "Отправить"}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
