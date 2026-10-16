// Классификация файла по MIME для загрузки: image/* → "image", video/* → "video",
// иначе → "file" (аудио намеренно доставляется как файл с плеером). Сервер
// (server/routes/uploads.js) принимает image/video/file/voice/video-note/…, и
// именно kind определяет, рендерится вложение как медиа (постер + плеер) или как файл.
export function fileKind(file) {
  const type = file.type || "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return "file";
}
