// Загрузка выбранных файлов перед отправкой — uploadPicks в public/js/components/composer.js:
// плитки с кольцом прогресса и отменой над полем ввода, у собеседника — «отправляет фото…».
import { useCallback, useEffect, useRef, useState } from "react";

import { UPLOAD_CANCELLED, type Uploaded, uploadFile, type UploadKind } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";

import { sendTyping } from "../api/send-message";
import { checkSize, uploadActionFor } from "../lib/files";

const ACTION_PING_MS = 2500;

export type Pick = { file: File; kind: UploadKind };

export type UploadTile = { id: number; name: string; kind: UploadKind; previewUrl: string | null; progress: number; failed: boolean };

let seq = 0;

export function useUploads(chatId: string) {
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const aborts = useRef(new Map<number, AbortController>());
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      aborts.current.forEach((c) => c.abort());
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const patch = (id: number, p: Partial<UploadTile>) => setTiles((list) => list.map((t) => (t.id === id ? { ...t, ...p } : t)));

  /**
   * Загрузить всё; вернуть загруженное и текст первой ошибки (отменённое — не ошибка).
   * Слишком большие файлы не начинаются вовсе.
   */
  const upload = useCallback(
    async (picks: readonly Pick[]) => {
      const errors: string[] = [];
      const items = picks.filter((p) => {
        const sizeError = checkSize(p.file, p.kind);
        if (sizeError) errors.push(sizeError);
        return !sizeError;
      });
      if (!items.length) return { uploaded: [] as Uploaded[], error: errors[0] ?? null, total: picks.length };

      const started = items.map((p) => {
        const id = ++seq;
        const previewUrl = p.file.type.startsWith("image/") ? URL.createObjectURL(p.file) : null;
        if (previewUrl) urls.current.push(previewUrl);
        const controller = new AbortController();
        aborts.current.set(id, controller);
        return { id, pick: p, controller, tile: { id, name: p.file.name, kind: p.kind, previewUrl, progress: 0, failed: false } satisfies UploadTile };
      });
      setTiles((list) => [...list, ...started.map((s) => s.tile)]);

      const action = uploadActionFor(items.map((p) => p.kind));
      sendTyping(chatId, action).catch(() => {});
      const ping = setInterval(() => sendTyping(chatId, action).catch(() => {}), ACTION_PING_MS);

      const results = await Promise.allSettled(
        started.map(({ id, pick, controller }) =>
          uploadFile(pick.file, pick.kind, { signal: controller.signal, onProgress: (progress) => patch(id, { progress }) }).catch((err: unknown) => {
            patch(id, { failed: true });
            throw err;
          })
        )
      );
      clearInterval(ping);
      sendTyping(chatId, "cancel").catch(() => {});
      for (const s of started) aborts.current.delete(s.id);
      setTiles((list) => list.filter((t) => !started.some((s) => s.id === t.id)));

      const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      for (const r of results) {
        if (r.status === "rejected" && !(r.reason instanceof Error && r.reason.message === UPLOAD_CANCELLED)) errors.push(errorText(r.reason, "Не удалось загрузить файл"));
      }
      return { uploaded, error: errors[0] ?? null, total: picks.length };
    },
    [chatId]
  );

  const cancel = useCallback((id: number) => {
    aborts.current.get(id)?.abort();
    setTiles((list) => list.filter((t) => t.id !== id));
  }, []);

  return { tiles, upload, cancel };
}
