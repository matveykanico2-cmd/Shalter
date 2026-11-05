// Переключение камеры — как public/js/lib/cameraSwitch.js: по подписи устройства, по
// очереди или через facingMode; занятую камеру на части телефонов надо сначала отпустить.
import { getUserMediaSafe } from "./media-quality";

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  } catch {
    return [];
  }
}

/** Сколько камер видно — кнопка «Другая камера» в звонке только при двух и больше. */
export async function cameraCount() {
  return (await listCameras()).length;
}

const looksFront = (label = "") => /front|user|facetime|передн/i.test(label);
const looksBack = (label = "") => /back|rear|environment|задн/i.test(label);

type Flip = { track: MediaStreamTrack; error?: undefined } | { track?: undefined; error: string };

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

  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      const track = (await getUserMediaSafe({ video: constraints })).getVideoTracks()[0];
      if (!track) continue;
      if (currentId && track.getSettings?.().deviceId === currentId) {
        track.stop();
        lastError = "same-device";
        continue;
      }
      return { track };
    } catch (err) {
      lastError = err;
      if (currentTrack && /NotReadable|Abort|TrackStart/i.test((err as Error)?.name ?? "")) {
        currentTrack.stop();
        try {
          const track = (await getUserMediaSafe({ video: constraints })).getVideoTracks()[0];
          if (track) return { track };
        } catch (err2) {
          lastError = err2;
        }
      }
    }
  }

  if (cameras.length <= 1) return { error: "На этом устройстве только одна камера" };
  if (lastError === "same-device") return { error: "Вторую камеру переключить не удалось" };
  if (/NotAllowed|Permission/i.test((lastError as Error)?.name ?? "")) return { error: "Доступ к камере запрещён" };
  return { error: "Не удалось включить вторую камеру" };
}
