import { type CSSProperties, useSyncExternalStore } from "react";

import { cancelUpload, getUploadTasks, pauseUpload, resumeUpload, subscribeUploadTasks } from "@/shared/lib/media-upload-manager";
import { Icon } from "@/shared/ui";

import styles from "./upload-tasks-host.module.css";

/** Общий transfer tray: задачи не исчезают при уходе из открытого чата. */
export function UploadTasksHost({ visible }: { visible: boolean }) {
  const tasks = useSyncExternalStore(subscribeUploadTasks, getUploadTasks, getUploadTasks);
  if (!visible || !tasks.length) return null;
  const active = tasks.filter((task) => !task.failed);
  const paused = active.filter((task) => task.phase === "paused").length;
  return (
    <aside className={styles.host} aria-label="Передача файлов">
      <div className={styles.header}>
        <span className={styles.title}><Icon name="Download" size={15} /> Передача файлов</span>
        <span className={styles.count}>{paused ? `${paused} на паузе` : `${active.length} ${active.length === 1 ? "файл" : "файла"}`}</span>
      </div>
      <div className={styles.list}>
        {tasks.map((task) => {
          const isPaused = task.phase === "paused";
          return (
            <div className={styles.task} key={task.id}>
              <span className={styles.taskIcon}>
                {task.previewUrl ? <span className={styles.preview} style={{ backgroundImage: `url("${task.previewUrl}")` }} /> : <Icon name={task.kind === "video" ? "Video" : task.kind === "image" ? "Image" : "File"} size={16} />}
              </span>
              <span className={styles.taskBody}>
                <span className={styles.taskName}>{task.name}</span>
                <span className={styles.taskStatus}>{task.failed ? "Не удалось загрузить" : task.phase === "processing" ? "Обработка…" : isPaused ? "Пауза" : `${Math.round(task.progress * 100)}%`}</span>
              </span>
              {!task.failed ? (
                <button type="button" className={styles.action} title={isPaused ? "Продолжить" : "Пауза"} aria-label={isPaused ? `Продолжить ${task.name}` : `Поставить на паузу ${task.name}`} onClick={() => (isPaused ? resumeUpload(task.id) : pauseUpload(task.id))}>
                  <Icon name={isPaused ? "PlayFill" : "PauseFill"} size={14} />
                </button>
              ) : null}
              <button type="button" className={styles.action} title="Отменить" aria-label={`Отменить ${task.name}`} onClick={() => cancelUpload(task.id)}>
                <Icon name="X" size={14} />
              </button>
              <span className={styles.ring} style={{ "--progress": `${Math.round(task.progress * 100)}%` } as CSSProperties} />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
