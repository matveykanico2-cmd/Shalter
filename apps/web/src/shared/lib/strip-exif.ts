// Метаданные фото (EXIF: геопозиция, модель телефона, время съёмки) не должны уходить
// собеседникам. JPEG не пережимаем: вырезаем сегменты APP1 (EXIF/XMP) байт в байт, а
// поворот снимка — единственное, без чего фото встанет боком, — кладём обратно
// крошечным EXIF только с Orientation. Остальные форматы отдаём как есть.

const SOI = 0xffd8;
const APP1 = 0xffe1;
const SOS = 0xffda;

/** Orientation (1–8) из сегмента APP1 «Exif», иначе null. */
function readOrientation(view: DataView, start: number, length: number): number | null {
  // "Exif\0\0"
  if (length < 14 || view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return null;
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > start + length) return null;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > start + length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** APP1 с EXIF из одного тега Orientation (big-endian TIFF). */
function orientationSegment(orientation: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = body.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...body]);
}

/** JPEG без EXIF/XMP (кроме поворота). Не JPEG или битый файл — null, отдаём оригинал. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== SOI) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | null = null;
  let stripped = false;
  let at = 2;
  while (at + 4 <= bytes.length) {
    const marker = view.getUint16(at);
    if ((marker & 0xff00) !== 0xff00) return null;
    if (marker === SOS) {
      parts.push(bytes.subarray(at));
      break;
    }
    const length = view.getUint16(at + 2);
    if (length < 2 || at + 2 + length > bytes.length) return null;
    if (marker === APP1) {
      orientation ??= readOrientation(view, at + 4, length - 2);
      stripped = true;
    } else {
      parts.push(bytes.subarray(at, at + 2 + length));
    }
    at += 2 + length;
  }
  if (!stripped) return null;
  if (orientation && orientation !== 1) parts.splice(1, 0, orientationSegment(orientation));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Файл для отправки: JPEG — без метаданных, остальное — как есть. */
export async function withoutPhotoMetadata(file: File): Promise<File> {
  if (file.type !== "image/jpeg") return file;
  try {
    const clean = stripJpegMetadata(new Uint8Array(await file.arrayBuffer()));
    return clean ? new File([clean], file.name, { type: file.type, lastModified: file.lastModified }) : file;
  } catch {
    return file;
  }
}
