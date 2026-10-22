// Минимальный разбор multipart/form-data для «Поделиться» — как в server/routes/shareTarget.js
// (multer в проекте нет): нужны только строковые поля и один файл, тело уже в памяти.

export interface MultipartFile {
  name: string;
  filename: string;
  type: string;
  data: Buffer;
}

export function parseContentType(header: unknown): { type: string; boundary: string } {
  const raw = String(header ?? "");
  const type = raw.split(";")[0]!.trim().toLowerCase();
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(raw);
  return { type, boundary: (m?.[1] ?? m?.[2] ?? "").trim() };
}

function parseDisposition(header: string): { name: string; filename: string } {
  const name = /name="([^"]*)"/i.exec(header)?.[1] ?? "";
  const filenameStar = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const filename = /filename="([^"]*)"/i.exec(header)?.[1];
  return { name, filename: filenameStar ? decodeURIComponent(filenameStar) : (filename ?? "") };
}

/** Секции ищем по границам. */
export function parseMultipart(buffer: Buffer, boundary: string): { fields: Record<string, string>; files: MultipartFile[] } {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];
  let index = buffer.indexOf(delimiter);
  while (index !== -1) {
    const start = index + delimiter.length;
    if (buffer.subarray(start, start + 2).toString() === "--") break; // конец
    const headerEnd = buffer.indexOf("\r\n\r\n", start);
    if (headerEnd === -1) break;
    const headers = buffer.subarray(start + 2, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;
    const next = buffer.indexOf(delimiter, bodyStart);
    if (next === -1) break;
    // Перед границей идёт CRLF — не часть содержимого.
    const body = buffer.subarray(bodyStart, next - 2);
    const disposition = /content-disposition:([^\r\n]*)/i.exec(headers)?.[1] ?? "";
    const { name, filename } = parseDisposition(disposition);
    const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? "";
    if (name) {
      if (filename) files.push({ name, filename, type, data: body });
      else fields[name] = body.toString("utf8");
    }
    index = next;
  }
  return { fields, files };
}
