import path from "node:path";

/** Расширение из имени файла, если оно безопасное (латиница и цифры, до 12 символов), иначе "". */
export function safeExtension(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : "";
}

/**
 * Уже сжатые форматы (видео, картинки, музыка, архивы): brotli их не уменьшает, а сжатый
 * файл отдаётся без Range — видео в Safari/iOS без него не играет.
 */
export const ALREADY_COMPRESSED_RE =
  /^\.(mp4|m4v|mov|webm|mkv|avi|3gp|jpe?g|png|gif|webp|avif|heic|heif|mp3|m4a|aac|ogg|oga|opus|flac|weba|zip|rar|7z|gz|bz2|xz|apk|ipa|dmg|pdf|docx|xlsx|pptx)$/;

/** Имя загруженного файла: `<время36>_<16 hex>` или `sha_<16 hex>`, с расширением или без. */
export const UPLOAD_FILENAME_RE = /^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
