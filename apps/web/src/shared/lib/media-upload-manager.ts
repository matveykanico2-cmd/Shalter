import { UPLOAD_CANCELLED, type Uploaded, uploadFile, type UploadKind } from "../api/upload";

export type UploadTask = {
  id: number;
  chatId: string;
  name: string;
  kind: UploadKind;
  previewUrl: string | null;
  progress: number;
  phase: "uploading" | "processing" | "paused" | "failed";
  failed: boolean;
};

type Task = UploadTask & {
  file: File;
  controller: AbortController | null;
  paused: boolean;
  cancelled: boolean;
  wake: (() => void) | null;
};

const tasks = new Map<number, Task>();
const listeners = new Set<() => void>();
let sequence = 0;

const publicTask = (task: Task): UploadTask => ({
  id: task.id,
  chatId: task.chatId,
  name: task.name,
  kind: task.kind,
  previewUrl: task.previewUrl,
  progress: task.progress,
  phase: task.phase,
  failed: task.failed,
});
let snapshot: UploadTask[] = [];
const notify = () => {
  snapshot = [...tasks.values()].map(publicTask);
  listeners.forEach((listener) => listener());
};
export const subscribeUploadTasks = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getUploadTasks = () => snapshot;

const waitUntilResumed = (task: Task) => new Promise<void>((resolve) => { task.wake = resolve; });

async function run(task: Task): Promise<Uploaded> {
  for (;;) {
    if (task.cancelled) throw new Error(UPLOAD_CANCELLED);
    if (task.paused) {
      task.phase = "paused";
      notify();
      await waitUntilResumed(task);
      if (task.cancelled) throw new Error(UPLOAD_CANCELLED);
    }
    task.controller = new AbortController();
    try {
      const uploaded = await uploadFile(task.file, task.kind, {
        signal: task.controller.signal,
        onProcessing: () => { task.phase = "processing"; task.progress = 1; notify(); },
        onProgress: (progress) => { task.phase = "uploading"; task.progress = progress; notify(); },
      });
      tasks.delete(task.id);
      if (task.previewUrl) URL.revokeObjectURL(task.previewUrl);
      notify();
      return uploaded;
    } catch (error) {
      task.controller = null;
      if (task.paused) continue;
      if (task.cancelled) throw new Error(UPLOAD_CANCELLED, { cause: error });
      task.failed = true;
      task.phase = "failed";
      notify();
      throw error;
    }
  }
}

export function startUploadTask(chatId: string, file: File, kind: UploadKind) {
  const id = ++sequence;
  const previewUrl = file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null;
  const task: Task = { id, chatId, file, kind, name: file.name, previewUrl, progress: 0, phase: "uploading", failed: false, controller: null, paused: false, cancelled: false, wake: null };
  tasks.set(id, task);
  notify();
  return { id, promise: run(task) };
}

export function pauseUpload(id: number) {
  const task = tasks.get(id);
  if (!task || task.failed) return;
  task.paused = true;
  task.controller?.abort();
  task.controller = null;
  task.phase = "paused";
  notify();
}

export function resumeUpload(id: number) {
  const task = tasks.get(id);
  if (!task || task.failed || !task.paused) return;
  task.paused = false;
  task.wake?.();
  task.wake = null;
  task.phase = "uploading";
  notify();
}

export function cancelUpload(id: number) {
  const task = tasks.get(id);
  if (!task) return;
  task.cancelled = true;
  task.paused = false;
  task.controller?.abort();
  task.wake?.();
  task.wake = null;
  tasks.delete(id);
  if (task.previewUrl) URL.revokeObjectURL(task.previewUrl);
  notify();
}
