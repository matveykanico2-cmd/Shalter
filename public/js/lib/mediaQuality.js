// Одно место, где живёт «какого качества картинку мы отправляем» — для звонков
// (lib/callController.js) и для эфиров (lib/liveController.js).
//
// Зачем отдельный модуль: раньше камера бралась запросом `video: true` (или
// голым facingMode), то есть на усмотрение браузера, — а браузеры по умолчанию
// дают 640×480 при 30 кадрах. Просить 1080p60 нужно в трёх местах (камера,
// переворот камеры, демонстрация экрана) и в двух сценариях (звонок, эфир);
// разъехавшись, эти шесть точек дали бы разное качество в звонке и в эфире.

// ideal, а не exact: `exact` — это требование, и на ноутбучной вебке без 60 fps
// getUserMedia просто падает с OverconstrainedError, то есть «нет камеры
// вообще». С ideal браузер отдаёт лучшее из того, что у него есть, и на слабой
// камере всё продолжает работать — просто в её собственном разрешении.
export const HD_VIDEO = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 60 },
};

// Экран просят в тех же 1080p60. cursor: "motion" — курсор виден только когда
// движется; на статичном слайде он не мозолит глаза, а при показе действия
// остаётся на месте.
export const HD_SCREEN = {
  video: { ...HD_VIDEO, cursor: "motion" },
  // Звук вкладки/системы — если браузер и выбранный источник это умеют. Отказ
  // не мешает: демонстрация продолжится без звука.
  audio: false,
};

export function cameraConstraints(extra = {}) {
  return { ...HD_VIDEO, ...extra };
}

// Одного разрешения в constraints мало.
//
// Попросить у камеры 1080p и получить 1080p у собеседника — разные вещи: WebRTC
// сам решает, чем жертвовать при нехватке канала, и по умолчанию первым делом
// уменьшает картинку. Здесь поднят потолок битрейта и явно сказано, что
// сохранять важнее.
//
// maintain-resolution — по результату замера, а не по общим соображениям. На
// двух headless-браузерах через локальную петлю (то есть при заведомо широком
// канале) вариант «беречь кадры» — degradationPreference: maintain-framerate
// плюс contentHint: motion — отдавал зрителю 640×360 при источнике 1920×1080:
// кодек считал, что 60 кадров важнее, и уменьшал картинку сам, без всякой
// нехватки полосы. С maintain-resolution и contentHint: detail до зрителя
// доходили честные 1920×1080 — и с камеры, и с экрана.
//
// Обратная сторона осознанная: на узком канале просядут кадры, а не чёткость.
// Для показа экрана это правильный размен (текст должен читаться), для лица в
// звонке — спорный, но 1080p просили именно как 1080p.
//
// Если браузер не умеет setParameters (или сендер ещё не готов) — молча
// пропускаем: это украшение поверх работающего звонка, а не его условие.
export async function tuneVideoSender(sender, { screen = false } = {}) {
  if (!sender || sender.track?.kind !== "video" || typeof sender.getParameters !== "function") return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = screen ? 6_000_000 : 4_000_000;
    params.encodings[0].maxFramerate = 60;
    // scaleResolutionDownBy сбрасываем явно: браузер мог выставить его сам на
    // прошлой, более узкой дорожке, и тогда 1080p уезжали бы уменьшенными.
    params.encodings[0].scaleResolutionDownBy = 1;
    params.degradationPreference = "maintain-resolution";
    await sender.setParameters(params);
  } catch {
    // Старый браузер или дорожка уже сменилась — качество останется на
    // усмотрение браузера, что ровно то, как было до этого модуля.
  }
}

// Пройтись по всем видеосендерам соединения. Вызывается после каждого
// addTrack/replaceTrack: параметры живут на сендере, а не на дорожке, но
// сбрасываются при пересоздании соединения.
export function tunePeerVideo(pc, opts = {}) {
  if (!pc || typeof pc.getSenders !== "function") return;
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind === "video") tuneVideoSender(sender, opts);
  }
}

// Подсказка кодеку, что за содержимое в дорожке. Для экрана — "detail": там
// мелкий текст и резкие границы, и кодек должен беречь их, а не плавность.
// "motion" (противоположная подсказка) на замере роняла картинку до 640×360,
// см. длинный комментарий выше.
export function hintScreenTrack(track) {
  if (track && "contentHint" in track) track.contentHint = "detail";
}
