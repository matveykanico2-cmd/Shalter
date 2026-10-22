import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { parseContentType, parseMultipart, type MultipartFile } from "./lib/multipart.js";
import { ShareBoxStore } from "./stores/share-box.store.js";

const MAX_TEXT_CHARS = 8000;

// Системное «Поделиться» (Web Share Target) — как server/routes/shareTarget.js и /api/share/:token
// в server/app.js. Браузер шлёт POST (multipart или форма) и ждёт перехода: содержимое кладём в
// ящик и ведём на /share/…, откуда приложение заберёт его по токену.
@Injectable()
export class ShareTargetService {
  public constructor(private readonly box: ShareBoxStore) {}

  /** Куда перейти после отправки: на /share/<токен> или, если делиться нечем, на главную. */
  public receive(contentType: unknown, body: unknown): string {
    const { type, boundary } = parseContentType(contentType);
    let fields: Record<string, string> = {};
    let files: MultipartFile[] = [];
    if (type.startsWith("multipart/form-data") && boundary) {
      ({ fields, files } = parseMultipart(Buffer.isBuffer(body) ? body : Buffer.alloc(0), boundary));
    } else {
      const raw = Buffer.isBuffer(body) ? body.toString("utf8") : "";
      for (const [k, v] of new URLSearchParams(raw)) fields[k] = v;
    }

    const text = [fields.title, fields.text, fields.url].filter(Boolean).join("\n").trim().slice(0, MAX_TEXT_CHARS);
    const first = files[0];
    const file = first ? { name: first.filename || first.name, type: first.type, data: first.data } : null;
    if (!text && !file) return "/";

    const token = this.box.put({
      text,
      url: typeof fields.url === "string" && /^https?:\/\//i.test(fields.url) ? fields.url : null,
      file: file && file.data.length ? { name: file.name, type: file.type, base64: file.data.toString("base64") } : null,
    });
    return `/share/${token}`;
  }

  public take(token: string) {
    const payload = this.box.take(token);
    if (!payload) throw new ApiError(404, "Ссылка устарела — поделитесь ещё раз");
    return { share: payload };
  }
}
