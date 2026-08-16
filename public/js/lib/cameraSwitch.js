// Переключение камеры — передняя ↔ задняя.
//
// Раньше это делалось в лоб: `getUserMedia({ video: { facingMode: "environment" } })`.
// Так оно не работает, и вот почему.
//
// 1. `facingMode` без `exact` — это пожелание, а не требование. Браузер вправе
//    вернуть ту же самую камеру, и на десктопе он ровно так и делает: там
//    камера одна, и «повернуть» её нельзя — но и сообщения об этом не было,
//    кнопка просто ничего не делала.
// 2. На телефоне вторую камеру часто нельзя открыть, пока занята первая:
//    getUserMedia падает с NotReadableError. Прежний код ловил исключение
//    пустым `catch` — и снова ничего не происходило, молча.
// 3. Даже когда камера переключалась, новая дорожка приходила включённой —
//    выключенная камера сама собой оживала.
//
// Здесь всё три случая разобраны: сначала ищем именно *другое* устройство по
// списку камер и просим его по deviceId (это работает и на десктопе с двумя
// вебками), при неудаче — просим по facingMode с `exact`, а если и это не
// вышло, освобождаем текущую дорожку и пробуем ещё раз. И возвращаем результат,
// чтобы интерфейс мог сказать, почему не получилось, вместо тишины.

// Список камер доступен по-настоящему только после того, как разрешение уже
// выдано: до этого браузер отдаёт устройства без label и иногда без deviceId.
// Мы вызываем это уже во время звонка, так что разрешение есть.
async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  } catch {
    return [];
  }
}

// Догадка о том, какая камера фронтальная, по названию устройства. Не
// единственный признак, а подсказка: на десктопе facingMode не сообщается
// вовсе, а название вроде "FaceTime HD" или "front" — сообщается.
function looksFront(label = "") {
  return /front|user|facetime|передн/i.test(label);
}

function looksBack(label = "") {
  return /back|rear|environment|задн/i.test(label);
}

// Сколько всего камер — интерфейсу это нужно, чтобы не показывать кнопку
// переворота там, где переворачивать нечего.
export async function cameraCount() {
  return (await listCameras()).length;
}

/**
 * Берёт новую видеодорожку с «другой» камеры.
 *
 * currentTrack — дорожка, которая играет сейчас (нужна и чтобы понять, от чего
 * отталкиваться, и чтобы освободить устройство, если иначе никак).
 * wantBack — какую сторону хотим получить.
 * video — дополнительные ограничения (размер для видео-сообщений).
 *
 * Возвращает { track } либо { error } с человеческим текстом.
 */
export async function getFlippedTrack({ currentTrack, wantBack, video = {} }) {
  const cameras = await listCameras();
  const currentId = currentTrack?.getSettings?.().deviceId;

  // Порядок попыток: сначала конкретное устройство, потом строгий facingMode,
  // потом мягкий. Первый вариант — единственный, который работает везде.
  const attempts = [];

  if (cameras.length > 1) {
    // Ищем устройство, которое по названию похоже на нужную сторону; если
    // названий нет (частый случай в Firefox), берём просто следующее по списку.
    const byLabel = cameras.find((d) => (wantBack ? looksBack(d.label) : looksFront(d.label)) && d.deviceId !== currentId);
    const nextInLine = cameras[(Math.max(0, cameras.findIndex((d) => d.deviceId === currentId)) + 1) % cameras.length];
    const target = byLabel ?? (nextInLine?.deviceId !== currentId ? nextInLine : null);
    if (target) attempts.push({ ...video, deviceId: { exact: target.deviceId } });
  }
  attempts.push({ ...video, facingMode: { exact: wantBack ? "environment" : "user" } });
  attempts.push({ ...video, facingMode: wantBack ? "environment" : "user" });

  let lastError = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
      const track = stream.getVideoTracks()[0];
      if (!track) continue;
      // Устройство то же самое — значит переключения не произошло. Отдавать
      // такую дорожку нельзя: картинка не изменится, а старую мы уже потеряем.
      if (currentId && track.getSettings?.().deviceId === currentId) {
        track.stop();
        lastError = "same-device";
        continue;
      }
      return { track };
    } catch (err) {
      lastError = err;
      // NotReadableError/AbortError — устройство занято текущей дорожкой.
      // Освобождаем её и пробуем ещё раз тем же способом: это единственный
      // выход на телефонах, которые не дают открыть две камеры сразу.
      if (currentTrack && /NotReadable|Abort|TrackStart/i.test(err?.name ?? "")) {
        currentTrack.stop();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
          const track = stream.getVideoTracks()[0];
          if (track) return { track };
        } catch (err2) {
          lastError = err2;
        }
      }
    }
  }

  if (cameras.length <= 1) return { error: "На этом устройстве только одна камера" };
  if (lastError === "same-device") return { error: "Вторую камеру переключить не удалось" };
  if (/NotAllowed|Permission/i.test(lastError?.name ?? "")) return { error: "Доступ к камере запрещён" };
  return { error: "Не удалось включить вторую камеру" };
}
