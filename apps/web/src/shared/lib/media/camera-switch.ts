// Переключение камеры — как public/js/lib/cameraSwitch.js: по подписи устройства, по
// очереди или через facingMode; занятую камеру на части телефонов надо сначала отпустить.
import { getUserMediaSafe } from "./media-quality";

/** Сколько камер видно — кнопка «Другая камера» в звонке только при двух и больше. */
export async function cameraCount() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput" && d.deviceId).length;
  } catch {
    return 0;
  }
}

/**
 * Перечисляет все видеоустройства с их свойствами. */
export async function listCameras() {
  try {
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}


export type Flip = { track: MediaStreamTrack; error?: undefined } | { track?: undefined; error: string };

/**
 * Переключает камеру на другую (фронтальную/заднюю).
 * Использует facingMode вместо枚举 устройств для скорости.
 */
export async function getFlippedTrack({
  currentTrack,
  wantBack,
  video = {},
}: {
  currentTrack: MediaStreamTrack | null;
  wantBack: boolean;
  video?: MediaTrackConstraints;
}): Promise<Flip> {
  const currentId = currentTrack?.getSettings?.().deviceId;
  const attempts: MediaTrackConstraints[] = [];

  // Сначала пробуем сменить facingMode — это быстрее, чем枚举 устройств
  const newFacing = wantBack ? "environment" : "user";
  attempts.push({ ...video, facingMode: newFacing });

  // Если нужно — перечисляем камеры для точного deviceId
  if (currentTrack) {
    const cameras = await listCameras();
    const currentIdx = cameras.findIndex((d) => d.deviceId === currentId);
    const nextIdx = (currentIdx + 1) % cameras.length;
    const nextCam = cameras[nextIdx];
    if (nextCam) {
      attempts.push({
        ...video,
        deviceId: { exact: nextCam.deviceId },
      });
    }
  }

  for (const constraints of attempts) {
    try {
      const track = (await getUserMediaSafe({ video: constraints })).getVideoTracks()[0];
      if (!track) continue;
      if (currentId && track.getSettings?.().deviceId === currentId) {
        track.stop();
        continue;
      }
      return { track };
    } catch (err) {
      if (currentTrack && /NotReadable|Abort|TrackStart/i.test((err as Error)?.name ?? "")) {
        currentTrack.stop();
        try {
          const track = (await getUserMediaSafe({ video: constraints })).getVideoTracks()[0];
          if (track) return { track };
        } catch (err2) {
          // ignored
        }
      }
    }
  }

  return { error: "Не удалось переключить камеру" };
}
