// Состояние загрузок живёт вне Composer: переход в другой чат и размонтирование
// компонента больше не сбрасывают прогресс и превью.
import { useCallback, useRef, useSyncExternalStore } from "react";

import { UPLOAD_CANCELLED, type Uploaded, type UploadKind } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { cancelUpload, getUploadTasks, pauseUpload, resumeUpload, startUploadTask, subscribeUploadTasks, type UploadTask } from "@/shared/lib/media-upload-manager";

import { sendTyping } from "../api/send-message";
import { checkSize, uploadActionFor } from "../lib/files";

const ACTION_PING_MS = 2500;

export type Pick = { file: File; kind: UploadKind };
export type UploadTile = UploadTask;

export function useUploads(chatId: string) {
  const all = useSyncExternalStore(subscribeUploadTasks, getUploadTasks, getUploadTasks);
  const cancelled = useRef(new Map<number, () => Promise<void>>());
  const tiles = all.filter((task) => task.chatId === chatId);

  const upload = useCallback(
    async (picks: readonly Pick[], callbacks?: { uploaded: (index: number, attachment: Uploaded) => Promise<void>; cancelled: (index: number) => Promise<void> }) => {
      const errors: string[] = [];
      const items = picks.filter((pick) => {
        const issue = checkSize(pick.file, pick.kind);
        if (issue) errors.push(issue);
        return !issue;
      });
      if (!items.length) return { uploaded: [] as Uploaded[], error: errors[0] ?? null, total: picks.length };

      const action = uploadActionFor(items.map((pick) => pick.kind));
      void sendTyping(chatId, action).catch(() => {});
      const ping = window.setInterval(() => void sendTyping(chatId, action).catch(() => {}), ACTION_PING_MS);
      const started = items.map((pick, index) => {
        const task = startUploadTask(chatId, pick.file, pick.kind);
        cancelled.current.set(task.id, async () => { await callbacks?.cancelled(index); });
        return { ...task, index };
      });
      const results = await Promise.allSettled(
        started.map(({ id, index, promise }) => promise.then(async (attachment) => {
          cancelled.current.delete(id);
          await callbacks?.uploaded(index, attachment);
          return attachment;
        }).catch(async (error: unknown) => {
          const onCancel = cancelled.current.get(id);
          cancelled.current.delete(id);
          if (error instanceof Error && error.message === UPLOAD_CANCELLED) await onCancel?.();
          throw error;
        }))
      );
      window.clearInterval(ping);
      void sendTyping(chatId, "cancel").catch(() => {});

      const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      for (const result of results) {
        if (result.status === "rejected" && !(result.reason instanceof Error && result.reason.message === UPLOAD_CANCELLED)) errors.push(errorText(result.reason, "Не удалось загрузить файл"));
      }
      return { uploaded, error: errors[0] ?? null, total: picks.length };
    },
    [chatId]
  );

  const cancel = useCallback((id: number) => cancelUpload(id), []);
  const togglePause = useCallback((id: number) => {
    const task = getUploadTasks().find((item) => item.id === id);
    if (task?.phase === "paused") resumeUpload(id);
    else pauseUpload(id);
  }, []);

  return { tiles, upload, cancel, togglePause };
}
